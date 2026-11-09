import crypto from 'node:crypto';
import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { expectedVersion } from '../middleware.js';
import { checksum, findIssues, matchPatient, type Identity, type Issue } from '../reconcile.js';
import { searchMedicines } from '../medicines.js';
import { checkDuplicateTherapy } from '../safety/molecules.js';
import { emitEvent } from '../whatsapp/emitter.js';
import { makeBrief } from '../clinicalSummary.js';
import { adminPatientView, ageFromDob, id, now, text } from '../util.js';
import { linkedPatientIds } from '../services/access.js';
import { casesFor, chartPoints, doctorLab, importedFor, labsFor, timeline } from '../services/chart.js';
import { cleanVitals, conflictsWith } from '../services/clinical.js';

// Doctor portal API. Every route checks the role here on the server, and patient data is only
// reachable for a patient the doctor is linked to (an appointment assigned to them, or their own encounter).
export function doctorRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;
  const R = () => ctx.repos;

  /** Resolve :id to a patient this doctor may use, or answer 404/403 without disclosing anything about the chart. */
  const patientFor = async (req: any, res: any, value: string) => {
    const p = await R().patients.byRef(String(value));
    if (!p) { res.status(404).json({ error: 'Patient not found' }); return null; }
    if (!(await linkedPatientIds(R(), req.user.id)).has(p.id)) {
      await audit(req, 'denied', 'patient', p.id, 'Doctor is not linked to this patient');
      res.status(403).json({ error: 'You are not linked to this patient. Ask the front desk to assign an appointment, or open a patient you are treating.' });
      return null;
    }
    return p;
  };

  // A walk-in or newly registered patient has no booking yet. A doctor who knows the exact patient ID can open the
  // chart by stating why; that creates a booking in their name, so access is explicit, limited to one patient and audited.
  router.post('/patients/open', roles('doctor'), async (req: any, res) => {
    const wanted = text(req.body?.patientId, 40);
    const reason = text(req.body?.reason, 200);
    if (reason.length < 5) return res.status(400).json({ error: 'Give the reason you are opening this chart (at least 5 characters)' });
    const p = wanted ? await R().patients.byCode(wanted) : null;
    if (!p) return res.status(404).json({ error: 'No patient with that ID. Check the ID on the patient card.' });
    if (!(await linkedPatientIds(R(), req.user.id)).has(p.id)) {
      const t = new Date();
      const visit = {
        id: id('appt'), patientId: p.id, patientName: p.name, patientIdCode: p.patientId, doctorId: req.user.id, doctorName: req.user.name,
        date: t.toISOString().slice(0, 10), time: t.toTimeString().slice(0, 5), reason, status: 'In Consultation', openedByDoctor: true
      };
      await R().appointments.insert(visit); // an opened chart is not a booked slot, so it carries no slotKey
      await audit(req, 'open', 'patient', p.id, `Doctor opened a chart by patient ID: ${reason}`);
    }
    res.json(adminPatientView(p));
  });

  router.get('/patients/:id/record', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.params.id);
    if (!p) return;
    await audit(req, 'read', 'patient', p.id, 'Open unified health record');
    const [vitals, referrals, carePlans, appointments, labs, imported, prescriptions, encounters] = await Promise.all([
      R().vitals.forPatient(p.id), R().referrals.find({ patientId: p.id }, { sort: { date: -1 } }), R().carePlans.find({ patientId: p.id }),
      R().appointments.forPatient(p.id), labsFor(R(), p), importedFor(R(), p), R().prescriptions.forPatient(p.id), R().encounters.forPatient(p.id),
    ]);
    res.json({
      ...adminPatientView(p),
      allergies: p.allergies || [],
      problems: p.problems || [],
      vitals,
      referrals,
      carePlans,
      timeline: timeline({ encounters, labs, prescriptions, imported, referrals, vitals }),
      chart: chartPoints(labs, imported),
      appointments,
      labOrders: labs.map(doctorLab),
      prescriptions
    });
  });

  // Pre-consultation brief. One request per doctor every few seconds, so it cannot be used to run up the model quota.
  const lastBrief = new Map<string, number>();
  router.post('/patients/:id/summary', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.params.id);
    if (!p) return;
    const t = Date.now();
    if (t - (lastBrief.get(req.user.id) ?? 0) < 4000) return res.status(429).json({ error: 'Wait a few seconds before asking for another brief.' });
    lastBrief.set(req.user.id, t);
    const [allLabs, vitalsList, prescriptions, encounters, referrals] = await Promise.all([
      labsFor(R(), p), R().vitals.forPatient(p.id, 1), R().prescriptions.forPatient(p.id), R().encounters.forPatient(p.id, 3), R().referrals.find({ patientId: p.id }),
    ]);
    const labs = allLabs.filter((o: any) => ['verified', 'released'].includes(o.status)).slice(0, 6)
      .flatMap((o: any) => (o.results ?? []).filter((r: any) => r.value).map((r: any) => ({ test: r.parameter, value: r.value, unit: r.unit, flag: r.flag, date: o.verifiedAt })));
    const brief = await makeBrief({
      ageYears: ageFromDob(p.dob), sex: p.gender || 'O',
      allergies: p.allergies || [], problems: (p.problems || []).slice(0, 12),
      vitals: vitalsList[0],
      medicines: prescriptions.filter((r: any) => r.status === 'Active').slice(0, 12),
      labs: labs.slice(0, 14),
      encounters,
      openItems: [
        ...referrals.filter((r: any) => r.status !== 'Completed').map((r: any) => `Referral to ${r.specialty} is ${String(r.status).toLowerCase()}`),
        ...allLabs.filter((o: any) => !['verified', 'released', 'cancelled'].includes(o.status)).map((o: any) => `${o.testName} not yet verified`),
      ].slice(0, 6),
    });
    await audit(req, 'read', 'summary', p.id, `Pre-consultation brief (${brief.source})`);
    res.json({ ...brief, generatedAt: now(), note: 'A reading aid made from the chart. Check it against the record before acting on it.' });
  });

  // ── encounters (SOAP) ─────────────────────────────────────────────────────
  router.post('/encounters', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const b = req.body ?? {};
    const fields = ['notes', 'diagnosis', 'chiefComplaint', 'subjective', 'objective', 'assessment', 'plan'] as const;
    const e: any = { id: id('enc'), patientId: p.id, doctorId: req.user.id, date: now(), source: 'CareWeave Clinic', imported: false };
    for (const f of fields) e[f] = text(b[f], 4000);
    if (!fields.some((f) => e[f])) return res.status(400).json({ error: 'Write at least a note, a complaint or an assessment' });
    // Check the vitals before storing anything, so a refusal does not leave a half-saved encounter behind.
    const v = b.vitals && typeof b.vitals === 'object' ? cleanVitals(b.vitals) : {};
    if (v.error) return res.status(400).json({ error: v.error });
    if (v.ok) e.vitals = v.ok;
    // Two documents, kept together: the encounter and its vitals row are both saved or neither is.
    const saved = await R().transaction(async (tx) => {
      const enc = await tx.encounters.insert(e);
      if (v.ok) await tx.vitals.insert({ id: id('vt'), patientId: p.id, date: now(), ...v.ok, recordedBy: req.user.name });
      return enc;
    });
    await audit(req, 'create', 'encounter', e.id, 'SOAP documentation');
    res.status(201).json(saved);
  });

  router.patch('/encounters/:id', roles('doctor'), async (req: any, res) => {
    const e = await R().encounters.byId(req.params.id);
    if (!e || e.doctorId !== req.user.id) return res.status(404).json({ error: 'Encounter not found' });
    const expected = expectedVersion(req, e);
    const changes: Record<string, any> = { updatedAt: now() };
    for (const f of ['notes', 'diagnosis', 'chiefComplaint', 'subjective', 'objective', 'assessment', 'plan']) if (req.body?.[f] !== undefined) changes[f] = text(req.body[f], 4000);
    const saved = await R().encounters.update(e, changes, expected);
    await audit(req, 'update', 'encounter', e.id);
    res.json(saved);
  });

  // ── vitals, allergies, problems ───────────────────────────────────────────
  router.post('/patients/:id/vitals', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.params.id);
    if (!p) return;
    const v = cleanVitals(req.body ?? {});
    if (v.error) return res.status(400).json({ error: v.error });
    if (!v.ok) return res.status(400).json({ error: 'Enter at least one measurement' });
    const row = await R().vitals.insert({ id: id('vt'), patientId: p.id, date: now(), ...v.ok, recordedBy: req.user.name });
    await audit(req, 'create', 'vitals', row.id, 'Vitals recorded');
    res.status(201).json(row);
  });

  router.post('/patients/:id/allergies', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.params.id);
    if (!p) return;
    const allergen = text(req.body?.allergen, 120);
    if (!allergen) return res.status(400).json({ error: 'Name the allergen' });
    const al = { id: id('al'), allergen, severity: ['Mild', 'Moderate', 'Severe / Anaphylaxis'].includes(req.body?.severity) ? req.body.severity : 'Moderate', reaction: text(req.body?.reaction, 200) };
    await R().patients.update(p, { allergies: [al, ...(p.allergies || [])] });
    await audit(req, 'create', 'allergy', al.id, 'Allergy documented');
    res.status(201).json(al);
  });

  router.post('/patients/:id/problems', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.params.id);
    if (!p) return;
    const name = text(req.body?.name, 160);
    if (!name) return res.status(400).json({ error: 'Name the problem' });
    const pr = { id: id('pr'), code: text(req.body?.code, 20), name, status: ['Active', 'Resolved', 'Chronic'].includes(req.body?.status) ? req.body.status : 'Active', diagnosedDate: now() };
    await R().patients.update(p, { problems: [pr, ...(p.problems || [])] });
    await audit(req, 'create', 'problem', pr.id, 'Problem added');
    res.status(201).json(pr);
  });

  // ── referrals and care plans ──────────────────────────────────────────────
  const mine = async (req: any) => [...(await linkedPatientIds(R(), req.user.id))];

  router.get('/referrals', roles('doctor'), async (req: any, res) => {
    await audit(req, 'read', 'referral', 'directory');
    res.json(await R().referrals.newestFirst({ patientId: { $in: await mine(req) } }));
  });
  router.post('/referrals', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const reason = text(req.body?.reason, 500);
    if (!reason) return res.status(400).json({ error: 'Give the reason for the referral' });
    const rf = await R().referrals.insert({
      id: id('ref'), patientId: p.id, patientName: p.name, patientIdCode: p.patientId,
      specialty: text(req.body?.specialty, 80) || 'Specialist', providerName: text(req.body?.providerName, 120),
      priority: ['Routine', 'Semi-urgent', 'Urgent'].includes(req.body?.priority) ? req.body.priority : 'Routine',
      reason, clinicalSummary: text(req.body?.clinicalSummary, 2000), date: now(), status: 'Drafted', createdBy: req.user.id
    });
    await audit(req, 'create', 'referral', rf.id, `Referral to ${rf.specialty}`);
    res.status(201).json(rf);
  });
  router.patch('/referrals/:id', roles('doctor'), async (req: any, res) => {
    const rf = await R().referrals.byId(req.params.id);
    if (!rf || !(await mine(req)).includes(rf.patientId)) return res.status(404).json({ error: 'Referral not found' });
    if (!['Drafted', 'Sent', 'Scheduled', 'Completed'].includes(req.body?.status)) return res.status(400).json({ error: 'Unknown referral status' });
    const saved = await R().referrals.update(rf, { status: req.body.status }, expectedVersion(req, rf));
    await audit(req, 'update', 'referral', rf.id, `Status: ${saved.status}`);
    res.json(saved);
  });

  router.get('/care-plans', roles('doctor'), async (req: any, res) => {
    await audit(req, 'read', 'care-plan', 'directory');
    res.json(await R().carePlans.newestFirst({ patientId: { $in: await mine(req) } }));
  });
  router.post('/care-plans', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const title = text(req.body?.title, 160);
    if (!title) return res.status(400).json({ error: 'Give the care plan a title' });
    const cp = await R().carePlans.insert({
      id: id('cp'), patientId: p.id, patientName: p.name, title, category: text(req.body?.category, 80) || 'General',
      goals: Array.isArray(req.body?.goals) ? req.body.goals.slice(0, 20).map((g: any) => text(g, 200)).filter(Boolean) : [],
      targets: Array.isArray(req.body?.targets) ? req.body.targets.slice(0, 20) : [],
      nextReviewDate: text(req.body?.nextReviewDate, 40) || now(), status: 'Active', createdBy: req.user.id, createdAt: now()
    });
    await audit(req, 'create', 'care-plan', cp.id, 'Care plan started');
    res.status(201).json(cp);
  });
  router.patch('/care-plans/:id', roles('doctor'), async (req: any, res) => {
    const cp = await R().carePlans.byId(req.params.id);
    if (!cp || !(await mine(req)).includes(cp.patientId)) return res.status(404).json({ error: 'Care plan not found' });
    const changes: Record<string, any> = {};
    if (req.body?.status && ['Active', 'Completed', 'Under Review'].includes(req.body.status)) changes.status = req.body.status;
    if (Array.isArray(req.body?.targets)) changes.targets = req.body.targets.slice(0, 20);
    const saved = await R().carePlans.update(cp, changes, expectedVersion(req, cp));
    await audit(req, 'update', 'care-plan', cp.id);
    res.json(saved);
  });

  // ── lab orders (the laboratory itself works through /api/lab/*) ───────────
  router.get('/lab-orders', roles('doctor'), async (req: any, res) => {
    const linked = [...(await linkedPatientIds(R(), req.user.id))];
    await audit(req, 'read', 'lab-order', 'directory');
    const rows = await R().orders.newestFirst({ status: { $ne: 'cancelled' }, $or: [{ createdBy: req.user.id }, { registeredPatientRef: { $in: linked } }] });
    res.json(rows.map(doctorLab));
  });

  router.post('/lab-orders', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const testName = text(req.body?.testName, 120);
    if (!testName) return res.status(400).json({ error: 'Choose the test to order' });
    // Every order is tied to a visit: the one named, else this doctor's latest encounter, else an open appointment.
    const wanted = text(req.body?.encounterId, 60);
    const enc = (await R().encounters.forPatient(p.id)).find((e: any) => e.doctorId === req.user.id && (!wanted || e.id === wanted))
      ?? (await R().appointments.forPatient(p.id)).find((a: any) => a.doctorId === req.user.id && !['Cancelled', 'No Show'].includes(a.status) && (!wanted || a.id === wanted));
    if (!enc) return res.status(400).json({ error: 'Open an encounter (SOAP note) or have an appointment for this patient before ordering a test' });
    const draw = () => `ORD-${Date.now().toString().slice(-7)}${crypto.randomInt(10, 100)}`;
    let orderId = draw();
    while (await R().orders.byId(orderId)) orderId = draw();
    const o = await R().orders.insert({
      id: orderId, external: false, patientId: p.patientId, registeredPatientRef: p.id, patientName: p.name,
      patientAge: ageFromDob(p.dob), patientGender: p.gender || 'O', encounterId: enc.id, testName,
      orderingDoctor: req.user.name, referralDoctor: req.user.name, orderedAt: now(), registrationAt: now(), status: 'requested',
      priority: /urgent|stat/i.test(String(req.body?.priority)) ? 'urgent' : 'routine',
      sampleType: text(req.body?.sampleType, 80) || undefined, handlingNote: text(req.body?.clinicalIndication, 500) || undefined,
      amendments: [], attachments: [], createdBy: req.user.id
    });
    await audit(req, 'create', 'lab-order', o.id, `Doctor order: ${testName} (${o.priority})`);
    res.status(201).json(doctorLab(o));
  });

  // A doctor may withdraw an order the lab has not started on. Everything else is the laboratory's call.
  router.patch('/lab-orders/:id/status', roles('doctor'), async (req: any, res) => {
    const o = await R().orders.byId(req.params.id);
    if (!o || o.createdBy !== req.user.id) return res.status(404).json({ error: 'Lab order not found' });
    if (!['requested', 'collection_pending'].includes(o.status)) return res.status(409).json({ error: 'The laboratory has already started this order' });
    const reason = text(req.body?.reason, 300);
    if (!reason) return res.status(400).json({ error: 'Give a reason for withdrawing the order' });
    const saved = await R().orders.update(o, { status: 'cancelled', statusReason: reason, updatedAt: now() }, expectedVersion(req, o));
    await audit(req, 'status:cancelled', 'labOrder', o.id, reason);
    res.json(doctorLab(saved));
  });

  // ── prescriptions ─────────────────────────────────────────────────────────
  // Duplicate-therapy check: the same active molecule under another brand, in-house or from a linked outside record.
  const duplicateAlerts = async (p: any, medicine: string, dosage: string, frequency: string) =>
    checkDuplicateTherapy({
      medicine, dosage, frequency,
      prescriptions: await R().prescriptions.forPatient(p.id),
      externalRecords: await R().externalRecords.find({ patientId: p.id }),
      // A bare brand name such as "Dolo" is looked up in the catalogue to find its generic composition.
      resolve: async (name) => {
        const first = name.trim().split(/[\s-]+/)[0].toLowerCase();
        const hit = (await searchMedicines(name, 3, R().mode === 'mongo')).find((m) => m.brand.toLowerCase().startsWith(first));
        return hit?.generic;
      },
    });

  router.post('/encounters/validate-prescription', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const medicine = text(req.body?.medicine, 200);
    if (!medicine) return res.status(400).json({ error: 'Name the medicine to check' });
    const alerts = await duplicateAlerts(p, medicine, text(req.body?.dosage, 80), text(req.body?.frequency, 80));
    res.json({ alerts, blocking: alerts.some((a) => a.severity === 'HIGH_COLLISION') });
  });

  router.post('/prescriptions', roles('doctor'), async (req: any, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const b = req.body ?? {};
    const medicine = text(b.medicine, 120), dosage = text(b.dosage, 80), frequency = text(b.frequency, 80);
    if (!medicine || !dosage || !frequency) return res.status(400).json({ error: 'Medicine, dose and frequency are required' });
    const enc = (await R().encounters.forPatient(p.id)).find((e: any) => e.doctorId === req.user.id && (!b.encounterId || e.id === b.encounterId));
    if (!enc) return res.status(400).json({ error: 'Document an encounter for this patient first, so the prescription is linked to it' });
    const allergy = (p.allergies || []).find((a: any) => conflictsWith(String(a.allergen), medicine));
    if (allergy && text(b.allergyOverrideReason, 300).length < 15) {
      await audit(req, 'blocked', 'prescription', p.id, 'Allergy conflict');
      return res.status(409).json({ error: `Allergy on record: ${allergy.allergen} (${allergy.severity}). Choose another medicine, or send an override reason of at least 15 characters.` });
    }
    const alerts = await duplicateAlerts(p, medicine, dosage, frequency);
    const high = alerts.filter((x) => x.severity === 'HIGH_COLLISION');
    const ov = b.duplicateOverride;
    const overrideOk = !!ov && ov.acknowledgedRisks === true && text(ov.overrideReason, 500).length >= 15;
    const molecules = [...new Set(high.flatMap((x) => x.matchedMolecules))].join(', ');
    if (high.length && !overrideOk) {
      await audit(req, 'blocked', 'prescription', p.id, `Duplicate therapy: ${medicine} repeats ${molecules} already given as ${high.map((x) => x.conflictingDrug.name).join('; ')}`);
      return res.status(409).json({
        error: `Duplicate therapy: ${molecules} is already being taken. Cancel, or send an override reason of at least 15 characters and acknowledge the risks.`,
        code: 'DUPLICATE_THERAPY', alerts, overrideRequired: { overrideReason: 'string (min 15 characters)', acknowledgedRisks: true },
      });
    }
    const r = await R().prescriptions.insert({
      id: id('rx'), patientId: p.id, encounterId: enc.id, medicine, dosage, route: text(b.route, 40), frequency,
      duration: text(b.duration, 60), instructions: text(b.instructions, 500), refills: Math.max(0, Math.min(12, Number(b.refills) || 0)),
      status: 'Active', date: now(), source: 'CareWeave Clinic', prescribingClinician: req.user.name, imported: false,
      allergyOverrideReason: allergy ? text(b.allergyOverrideReason, 300) : undefined,
      duplicateOverride: high.length ? { reason: text(ov.overrideReason, 500), acknowledgedRisks: true, molecules: high.flatMap((x) => x.matchedMolecules), conflictsWith: high.map((x) => x.conflictingDrug.name) } : undefined
    });
    await audit(req, 'create', 'prescription', r.id, `${medicine} ${dosage}${allergy ? ' (allergy override)' : ''}`);
    if (high.length) await audit(req, 'override', 'prescription', r.id, `Duplicate therapy override for ${molecules}: ${text(ov.overrideReason, 500)}`);
    emitEvent('PRESCRIPTION_PRESCRIBED', {
      patientId: p.patientId, name: p.name, phone: p.phone, doctor: req.user.name,
      medicines: [{ name: medicine, dosage, frequency, foodInstruction: r.instructions || '' }],
    });
    res.status(201).json(r);
  });

  router.patch('/prescriptions/:id', roles('doctor'), async (req: any, res) => {
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

  // ── external records and reconciliation ───────────────────────────────────
  const caseFrom = (rec: any, patientId: string | null, issue: Issue | { type: 'match' | 'unmatched'; title: string; detail: string; evidence: string[]; candidates?: any[] }, importedBy: string) => ({
    id: id('case'), type: issue.type, title: issue.title, detail: issue.detail, reference: rec.sourceRecordId || rec.id,
    evidence: issue.evidence, sideBySide: (issue as any).sideBySide, candidates: (issue as any).candidates,
    recordId: rec.id, patientId, importedBy, status: 'open', createdAt: now()
  });

  /** Run the duplicate and conflict checks for a record that now belongs to a patient. Returns the cases to open and the record's new status; writes nothing. */
  const analyze = async (rec: any, p: any, by: string) => {
    const [others, labs, rx] = await Promise.all([
      R().externalRecords.find({ patientId: p.id, id: { $ne: rec.id } }),
      labsFor(R(), p).then((l) => l.filter((o: any) => ['verified', 'released'].includes(o.status))),
      R().prescriptions.forPatient(p.id),
    ]);
    const issues = findIssues(rec, others, labs, rx);
    const status = issues.some((i) => i.type === 'conflict') ? 'Conflict flagged' : issues.length ? 'Duplicate flagged' : 'Imported';
    return { cases: issues.map((i) => caseFrom(rec, p.id, i, by)), status };
  };

  const validRecord = (raw: any) => {
    const facility = text(raw?.facility, 120);
    const kind = text(raw?.kind, 20);
    if (!facility) return { error: 'Name the source facility' };
    if (!['lab', 'medication', 'consultation'].includes(kind)) return { error: 'Record type must be lab, medication or consultation' };
    const content = raw?.content;
    if (!content || typeof content !== 'object' || Array.isArray(content) || JSON.stringify(content).length > 20000) return { error: 'The record content is missing or too large' };
    const ed = text(raw?.eventDate, 40);
    if (ed) { const d = new Date(ed); if (isNaN(+d) || d.getTime() > Date.now() + 86400000) return { error: 'The event date is not a valid past date' }; }
    const who: Identity = { identifier: text(raw?.patient?.identifier ?? raw?.patientId, 40), name: text(raw?.patient?.name, 120), dob: text(raw?.patient?.dob, 20), phone: text(raw?.patient?.phone, 40) };
    if (!who.identifier && !who.name && !who.dob && !who.phone) return { error: 'Give at least one identity field (patient identifier, name, date of birth or phone) so the record can be matched' };
    return { ok: { facility, kind, content, eventDate: ed || '', sourceRecordId: text(raw?.sourceRecordId, 80), documentRef: text(raw?.documentRef, 160), who } };
  };

  router.post('/external-records/import', roles('doctor'), async (req: any, res) => {
    const list = Array.isArray(req.body?.records) ? req.body.records : [req.body];
    if (list.length > 200) return res.status(400).json({ error: 'Import at most 200 records at a time' });
    const out: any[] = [];
    for (const raw of list) {
      const v = validRecord({ ...raw, facility: raw?.facility ?? req.body?.facility });
      if (!v.ok) { out.push({ error: v.error, sourceRecordId: raw?.sourceRecordId }); continue; }
      const { who, ...base } = v.ok;
      const rec: any = { id: id('ext'), ...base, patientId: null, importedAt: now(), importedBy: req.user.id, importedByName: req.user.name, checksum: checksum(base.content), identity: who, status: 'Requires review' };
      const m = matchPatient(await R().patients.candidatesFor(who), who);
      const cases: any[] = [];
      if (m.status === 'linked') {
        rec.patientId = m.candidate.patient.id;
        rec.matchEvidence = m.candidate.evidence;
        const a = await analyze(rec, m.candidate.patient, req.user.id);
        cases.push(...a.cases);
        rec.status = a.status;
      } else if (m.status === 'ambiguous') {
        rec.status = 'Requires review (identity)';
        const cands = m.candidates.map((x) => ({ patientId: x.patient.patientId, id: x.patient.id, name: x.patient.name, score: x.score, evidence: x.evidence, conflicts: x.conflicts }));
        cases.push(caseFrom(rec, null, { type: 'match', title: 'Possible patient match needs review', detail: `${rec.facility} · ${rec.sourceRecordId || rec.id}: ${cands.length} possible patient(s). Nothing was linked.`, evidence: ['Similar details are not proof of identity', ...(cands[0]?.evidence ?? []), ...(cands[0]?.conflicts ?? [])], candidates: cands }, req.user.id));
      } else {
        rec.status = 'Unmatched';
        cases.push(caseFrom(rec, null, { type: 'unmatched', title: 'No matching patient', detail: `${rec.facility} · ${rec.sourceRecordId || rec.id} stays separate until a reviewer links it to a patient.`, evidence: ['No patient scored high enough on the identity fields supplied'] }, req.user.id));
      }
      // The record and its review cases are saved together: a record without the cases that flag it for review would look clean.
      await R().transaction(async (tx) => {
        await tx.externalRecords.insert(rec);
        for (const k of cases) await tx.cases.insert(k);
      });
      await audit(req, 'import', 'external-record', rec.id, `Source: ${rec.facility} · ${rec.status}`);
      out.push({ record: rec, outcome: rec.status, cases });
    }
    const failed = out.filter((x) => x.error).length;
    res.status(out.length && failed === out.length ? 400 : 201).json({ results: out, imported: out.length - failed, rejected: failed, ...(out[0]?.record ? { record: out[0].record, case: out[0].cases?.[0] } : { error: out[0]?.error }) });
  });

  router.get('/reconciliation/cases', roles('doctor'), async (req: any, res) => {
    await audit(req, 'read', 'reconciliation', 'queue');
    res.json(await casesFor(R(), req.user.id));
  });

  router.patch('/reconciliation/cases/:id', roles('doctor'), async (req: any, res) => {
    const k = (await casesFor(R(), req.user.id)).find((x: any) => x.id === req.params.id);
    if (!k) return res.status(404).json({ error: 'Review case not found' });
    const decision = req.body?.decision;
    if (!['keep-separate', 'link'].includes(decision)) return res.status(400).json({ error: 'Decision must be keep-separate or link' });
    const rec = await R().externalRecords.byId(k.recordId);
    if (!rec) return res.status(404).json({ error: 'The imported record no longer exists' });

    const recChanges: Record<string, any> = {};
    const newCases: any[] = [];
    if (decision === 'keep-separate') {
      recChanges.status = 'Kept separate';
    } else if (k.type === 'match' || k.type === 'unmatched') {
      // The reviewer chooses the patient. It must be one this doctor is linked to.
      const wanted = text(req.body?.linkPatientId, 60) || k.candidates?.[0]?.id;
      const p = wanted ? await R().patients.byRef(wanted) : null;
      if (!p) return res.status(400).json({ error: 'Choose the patient to link this record to' });
      if (!(await linkedPatientIds(R(), req.user.id)).has(p.id)) return res.status(403).json({ error: 'You are not linked to that patient' });
      recChanges.patientId = p.id;
      const a = await analyze({ ...rec, patientId: p.id }, p, req.user.id);
      newCases.push(...a.cases);
      // Duplicate or conflict cases opened for the reviewer keep their flag; otherwise the record is simply linked.
      recChanges.status = a.status !== 'Imported' ? a.status : 'Linked (reviewed)';
    } else if (k.type === 'duplicate') {
      recChanges.status = 'Duplicate (linked to original)';
    } else {
      recChanges.status = 'Linked (reviewed)';
    }
    const expected = expectedVersion(req, k);
    // Linking the record, opening any new cases and closing this one happen together. A second reviewer who decided the same
    // case a moment earlier makes the case update fail with a conflict, which also undoes the record change.
    const saved = await R().transaction(async (tx) => {
      await tx.externalRecords.update(rec, recChanges);
      for (const c of newCases) await tx.cases.insert(c);
      return tx.cases.update(k, { status: 'reviewed', decision, reviewedBy: req.user.name, reviewedAt: now() }, expected);
    });
    await audit(req, 'resolve', 'reconciliation-case', k.id, `Decision: ${decision}`);
    res.json(saved);
  });

  return router;
}
