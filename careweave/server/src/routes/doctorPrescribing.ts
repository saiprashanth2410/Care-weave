import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import type { DoctorAccess } from './doctorAccess.js';
import { expectedVersion } from '../middleware.js';
import { searchMedicines } from '../medicines.js';
import { checkDuplicateTherapy } from '../safety/molecules.js';
import { emitEvent } from '../whatsapp/emitter.js';
import { id, now, text } from '../util.js';
import { conflictsWith } from '../services/clinical.js';
import type { AuthedRequest } from '../middleware.js';
import type { Request } from 'express';

// Doctor API: prescriptions, checked for allergy and duplicate therapy before anything is saved.
/** A repeated molecule or a dangerous drug-drug interaction stops the prescription until the doctor documents why it goes ahead. */
const STOPS = new Set(['HIGH_COLLISION', 'DRUG_DRUG_INTERACTION']);
const what = (alerts: { severity: string }[]) => (alerts.some((x) => x.severity === 'DRUG_DRUG_INTERACTION') ? 'Dangerous drug interaction' : 'Duplicate therapy');

export function doctorPrescribingRoutes(ctx: AppCtx, access: DoctorAccess) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;
  const { R, patientFor } = access;

  // ── prescriptions ─────────────────────────────────────────────────────────
  // Duplicate-therapy check: the same active molecule under another brand, in-house or from a linked outside record.
  const duplicateAlerts = async (p: any, medicine: string, dosage: string, frequency: string, alsoPrescribing: any[] = []) =>
    checkDuplicateTherapy({
      medicine, dosage, frequency,
      // Medicines written in the same prescription count as already being taken, so two brands of one drug in one prescription are caught.
      prescriptions: [...(await R().prescriptions.forPatient(p.id)), ...alsoPrescribing],
      externalRecords: await R().externalRecords.find({ patientId: p.id }),
      // A bare brand name such as "Dolo" is looked up in the catalogue to find its generic composition.
      resolve: async (name) => {
        const first = name.trim().split(/[\s-]+/)[0].toLowerCase();
        const hit = (await searchMedicines(name, 3, R().mode === 'mongo')).find((m) => m.brand.toLowerCase().startsWith(first));
        return hit?.generic;
      },
    });

  /** A medicine of the prescription being written, shaped like a saved one so the duplicate check can read it. */
  const pendingRx = (req: Request, r: any, i: number) => ({
    id: `pending-${i}`, medicine: text(r?.medicine, 120), dosage: text(r?.dosage, 80), frequency: text(r?.frequency, 80), duration: text(r?.duration, 60),
    status: 'Active', date: now(), source: 'CareWeave Clinic', prescribingClinician: req.user.name,
  });

  router.post('/encounters/validate-prescription', roles('doctor'), async (req, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const medicine = text(req.body?.medicine, 200);
    if (!medicine) return res.status(400).json({ error: 'Name the medicine to check' });
    const also = (Array.isArray(req.body?.alsoPrescribing) ? req.body.alsoPrescribing.slice(0, 15) : []).filter((r: Record<string, any>) => text(r?.medicine, 120)).map((r: Record<string, any>, i: number) => pendingRx(req, r, i));
    const alerts = await duplicateAlerts(p, medicine, text(req.body?.dosage, 80), text(req.body?.frequency, 80), also);
    res.json({ alerts, blocking: alerts.some((a) => a.severity === 'HIGH_COLLISION') });
  });

  const rxRecord = (p: any, enc: any, req: AuthedRequest, r: any, allergy: any, high: any[], ov: any) => ({
    id: id('rx'), patientId: p.id, encounterId: enc.id, medicine: r.medicine, dosage: r.dosage, route: text(r.route, 40), frequency: r.frequency,
    duration: text(r.duration, 60), instructions: text(r.instructions, 500), refills: Math.max(0, Math.min(12, Number(r.refills) || 0)),
    ...(r.diagnosis ? { diagnosis: text(r.diagnosis, 200) } : {}), ...(r.notes ? { notes: text(r.notes, 500) } : {}),
    status: 'Active', date: now(), source: 'CareWeave Clinic', prescribingClinician: req.user.name, imported: false,
    allergyOverrideReason: allergy ? text(r.allergyOverrideReason, 300) : undefined,
    duplicateOverride: high.length ? { reason: text(ov.overrideReason, 500), acknowledgedRisks: true, molecules: high.flatMap((x) => x.matchedMolecules), conflictsWith: high.map((x) => x.conflictingDrug.name) } : undefined,
  });

  router.post('/prescriptions', roles('doctor'), async (req, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const b = req.body ?? {};
    const medicine = text(b.medicine, 120), dosage = text(b.dosage, 80), frequency = text(b.frequency, 80);
    if (!medicine || !dosage || !frequency) return res.status(400).json({ error: 'Medicine, dose and frequency are required' });
    const enc = (await R().encounters.forPatient(p.id)).find((e) => e.doctorId === req.user.id && (!b.encounterId || e.id === b.encounterId));
    if (!enc) return res.status(400).json({ error: 'Document an encounter for this patient first, so the prescription is linked to it' });
    const allergy = (p.allergies || []).find((a) => conflictsWith(String(a.allergen), medicine));
    if (allergy && text(b.allergyOverrideReason, 300).length < 15) {
      await audit(req, 'blocked', 'prescription', p.id, 'Allergy conflict');
      return res.status(409).json({ error: `Allergy on record: ${allergy.allergen} (${allergy.severity}). Choose another medicine, or send an override reason of at least 15 characters.` });
    }
    const alerts = await duplicateAlerts(p, medicine, dosage, frequency);
    const high = alerts.filter((x) => STOPS.has(x.severity));
    const ov = b.duplicateOverride;
    const overrideOk = !!ov && ov.acknowledgedRisks === true && text(ov.overrideReason, 500).length >= 15;
    const molecules = [...new Set(high.flatMap((x) => x.matchedMolecules))].join(', ');
    if (high.length && !overrideOk) {
      await audit(req, 'blocked', 'prescription', p.id, `${what(high)}: ${medicine} repeats ${molecules} already given as ${high.map((x) => x.conflictingDrug.name).join('; ')}`);
      return res.status(409).json({
        error: `${what(high)}: ${molecules} is already being taken or interacts with current therapy. Cancel, or send an override reason of at least 15 characters and acknowledge the risks.`,
        code: 'DUPLICATE_THERAPY', alerts, overrideRequired: { overrideReason: 'string (min 15 characters)', acknowledgedRisks: true },
      });
    }
    const r = await R().prescriptions.insert(rxRecord(p, enc, req, { ...b, medicine, dosage, frequency }, allergy, high, ov));
    await audit(req, 'create', 'prescription', r.id, `${medicine} ${dosage}${allergy ? ' (allergy override)' : ''}`);
    if (high.length) await audit(req, 'override', 'prescription', r.id, `Duplicate therapy override for ${molecules}: ${text(ov.overrideReason, 500)}`);
    await emitEvent('PRESCRIPTION_PRESCRIBED', {
      patientId: p.patientId, name: p.name, phone: p.phone, doctor: req.user.name,
      medicines: [{ name: medicine, dosage, frequency, foodInstruction: r.instructions || '' }],
    });
    res.status(201).json(r);
  });

  // One prescription with several medicines. Every medicine is checked first (allergy, and duplicate therapy against what the patient
  // already takes AND against the other medicines in this prescription); if any needs the doctor's decision nothing is saved.
  router.post('/prescriptions/batch', roles('doctor'), async (req, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const b = req.body ?? {};
    const rows = (Array.isArray(b.medicines) ? b.medicines : []).slice(0, 15).map((r: Record<string, any>) => ({
      medicine: text(r?.medicine, 120), dosage: text(r?.dosage, 80), frequency: text(r?.frequency, 80), route: text(r?.route, 40),
      duration: text(r?.duration, 60), instructions: text(r?.instructions, 500), refills: r?.refills,
      diagnosis: text(b.diagnosis, 200), notes: text(b.notes, 500),
      allergyOverrideReason: text(r?.allergyOverrideReason, 300), duplicateOverride: r?.duplicateOverride,
    }));
    if (!rows.length) return res.status(400).json({ error: 'Add at least one medicine' });
    const bad = rows.findIndex((r: Record<string, any>) => !r.medicine || !r.dosage || !r.frequency);
    if (bad >= 0) return res.status(400).json({ error: `Medicine ${bad + 1}: name, dose and frequency are required`, row: bad });
    const enc = (await R().encounters.forPatient(p.id)).find((e) => e.doctorId === req.user.id && (!b.encounterId || e.id === b.encounterId));
    if (!enc) return res.status(400).json({ error: 'Document an encounter for this patient first, so the prescription is linked to it' });

    const blocked: { index: number; kind: 'allergy' | 'duplicate'; error: string; alerts?: any[] }[] = [];
    const checks: { allergy: any; high: any[]; ov: any }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const allergy = (p.allergies || []).find((a) => conflictsWith(String(a.allergen), r.medicine));
      if (allergy && r.allergyOverrideReason.length < 15) {
        blocked.push({ index: i, kind: 'allergy', error: `Allergy on record: ${allergy.allergen} (${allergy.severity}). Choose another medicine, or give an override reason of at least 15 characters.` });
      }
      const alerts = await duplicateAlerts(p, r.medicine, r.dosage, r.frequency, rows.slice(0, i).map((x: any, j: number) => pendingRx(req, x, j)));
      const high = alerts.filter((x) => STOPS.has(x.severity));
      const ov = r.duplicateOverride;
      const overrideOk = !!ov && ov.acknowledgedRisks === true && text(ov.overrideReason, 500).length >= 15;
      if (high.length && !overrideOk) {
        const molecules = [...new Set(high.flatMap((x) => x.matchedMolecules))].join(', ');
        blocked.push({ index: i, kind: 'duplicate', alerts, error: `${what(high)}: ${molecules} is already being taken or interacts with current therapy. Cancel this medicine, or give an override reason of at least 15 characters and acknowledge the risks.` });
      }
      checks.push({ allergy, high, ov });
    }
    if (blocked.length) {
      for (const x of blocked) await audit(req, 'blocked', 'prescription', p.id, `${rows[x.index].medicine}: ${x.kind === 'allergy' ? 'Allergy conflict' : 'Duplicate therapy'}`);
      return res.status(409).json({ code: 'PRESCRIPTION_BLOCKED', error: `${blocked.length} medicine problem(s) need your decision. Nothing was saved.`, blocked });
    }

    const saved = await R().transaction(async (tx) => {
      const out: any[] = [];
      for (let i = 0; i < rows.length; i++) out.push(await tx.prescriptions.insert(rxRecord(p, enc, req, rows[i], checks[i].allergy, checks[i].high, checks[i].ov)));
      return out;
    });
    for (let i = 0; i < saved.length; i++) {
      const { allergy, high, ov } = checks[i];
      await audit(req, 'create', 'prescription', saved[i].id, `${rows[i].medicine} ${rows[i].dosage}${allergy ? ' (allergy override)' : ''} · ${saved.length} medicine(s) in one prescription`);
      if (high.length) await audit(req, 'override', 'prescription', saved[i].id, `Duplicate therapy override for ${[...new Set(high.flatMap((x) => x.matchedMolecules))].join(', ')}: ${text(ov.overrideReason, 500)}`);
    }
    await emitEvent('PRESCRIPTION_PRESCRIBED', {
      patientId: p.patientId, name: p.name, phone: p.phone, doctor: req.user.name,
      medicines: saved.map((r) => ({ name: r.medicine, dosage: r.dosage, frequency: r.frequency, foodInstruction: r.instructions || '' })),
    });
    res.status(201).json(saved);
  });

  router.patch('/prescriptions/:id', roles('doctor'), async (req, res) => {
    const r = await R().prescriptions.byId(req.params.id);
    if (!r || r.prescribingClinician !== req.user.name) return res.status(404).json({ error: 'Prescription not found' });
    const expected = expectedVersion(req, r);
    const changes: Record<string, any> = {};
    if (req.body?.status) {
      if (!['Active', 'Discontinued', 'Completed'].includes(req.body.status)) return res.status(400).json({ error: 'Unknown prescription status' });
      if (req.body.status === 'Discontinued' && !text(req.body.discontinueReason)) return res.status(400).json({ error: 'Give a reason for stopping this medicine' });
      changes.status = req.body.status;
    }
    if (req.body?.refills !== undefined) changes.refills = Math.max(0, Math.min(12, Number(req.body.refills) || 0));
    if (req.body?.discontinueReason) changes.discontinueReason = text(req.body.discontinueReason, 300);
    const saved = await R().prescriptions.update(r, changes, expected);
    await audit(req, 'update', 'prescription', r.id, `Status: ${saved.status}`);
    res.json(saved);
  });

  return router;
}
