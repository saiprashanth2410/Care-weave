import type { Express } from 'express';
import crypto from 'node:crypto';
import { checksum, findIssues, matchPatient, type Identity, type Issue } from './reconcile.js';
import { searchMedicines } from './medicines.js';
import { checkDuplicateTherapy } from './safety/molecules.js';

// Doctor portal API. Every route checks the role here on the server, and patient data is only
// reachable for a patient the doctor is linked to (an appointment assigned to them, or their own encounter).

export type Ctx = {
  app: Express;
  db: () => any;
  save: () => Promise<void>;
  audit: (req: any, action: string, entity: string, entityId: string, detail?: string) => void;
  roles: (...allowed: string[]) => any;
  id: (prefix: string) => string;
  now: () => string;
  patientById: (v: string) => any;
  text: (v: any, max?: number) => string;
  isToday: (d: string) => boolean;
  adminPatientView: (p: any) => any;
  mongoConnected?: () => boolean;
};

const STATUS_FOR_DOCTOR: Record<string, string> = {
  requested: 'Requested',
  collection_pending: 'Sample Collection Pending',
  recollect_required: 'Sample Collection Pending',
  collected: 'Sample Collected',
  processing: 'Processing',
  awaiting_verification: 'Awaiting Verification',
  verified: 'Verified',
  released: 'Released to Doctor'
};

const num = (v: any) => {
  const n = Number.parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// A short list of drug families, so an allergy to one member also catches the others. It is a safety net for the
// demo, not clinical decision support: anything not listed here is only matched by name.
const DRUG_FAMILIES: string[][] = [
  ['penicillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'piperacillin', 'flucloxacillin', 'cloxacillin', 'oxacillin', 'augmentin', 'co-amoxiclav', 'amoxiclav'],
  ['sulfa', 'sulfonamide', 'sulfamethoxazole', 'co-trimoxazole', 'cotrimoxazole', 'trimethoprim', 'bactrim'],
  ['nsaid', 'ibuprofen', 'diclofenac', 'naproxen', 'ketorolac', 'aspirin', 'indomethacin'],
  ['cephalosporin', 'cefuroxime', 'ceftriaxone', 'cefixime', 'cefalexin', 'cephalexin', 'cefazolin']
];
function conflictsWith(allergen: string, medicine: string) {
  const a = allergen.toLowerCase().trim(), m = medicine.toLowerCase().trim();
  if (!a || !m) return false;
  if (m.includes(a) || a.includes(m)) return true;
  return DRUG_FAMILIES.some((fam) => fam.some((x) => a.includes(x)) && fam.some((x) => m.includes(x)));
}

export function registerDoctorRoutes(c: Ctx) {
  const { app, roles, audit, save, id, now, text } = c;
  const db = () => c.db();

  // ── access control ────────────────────────────────────────────────────────
  const linkedPatientIds = (userId: string) => {
    const ids = new Set<string>();
    for (const a of db().appointments) if (a.doctorId === userId) ids.add(a.patientId);
    for (const e of db().encounters) if (e.doctorId === userId) ids.add(e.patientId);
    return ids;
  };
  const isLinked = (req: any, p: any) => linkedPatientIds(req.user.id).has(p.id);
  /** Resolve :id to a patient this doctor may use, or answer 404/403 without disclosing anything about the chart. */
  const patientFor = (req: any, res: any, value: string) => {
    const p = c.patientById(String(value));
    if (!p) { res.status(404).json({ error: 'Patient not found' }); return null; }
    if (!isLinked(req, p)) {
      audit(req, 'denied', 'patient', p.id, 'Doctor is not linked to this patient');
      void save();
      res.status(403).json({ error: 'You are not linked to this patient. Ask the front desk to assign an appointment, or open a patient you are treating.' });
      return null;
    }
    return p;
  };

  // ── lab adapter: our multi-analyte order -> the shape the doctor screens expect ──
  const doctorLab = (o: any) => {
    const released = ['verified', 'released'].includes(o.status);
    const params: any[] = o.results ?? [];
    const flagged = params.filter((r) => r.flag && r.flag !== 'normal');
    const lead = flagged[0] ?? params[0];
    return {
      id: o.id,
      orderId: o.id,
      patientId: o.registeredPatientRef ?? o.patientId,
      patientName: o.patientName,
      patientIdCode: o.patientId,
      encounterId: o.encounterId,
      testName: o.testName,
      orderingDoctor: o.orderingDoctor,
      requestedAt: o.orderedAt,
      sampleType: o.sampleType ?? '',
      priority: o.priority === 'urgent' ? 'Urgent' : 'Routine',
      clinicalIndication: o.handlingNote ?? '',
      status: STATUS_FOR_DOCTOR[o.status] ?? 'Requested',
      amended: (o.amendments ?? []).length,
      // Values only appear once a verifier has signed. Drafts and submitted values stay in the lab.
      result: released && lead
        ? {
            id: `res-${o.id}`,
            orderId: o.id,
            value: params.length > 1 ? `${params.length} analytes${flagged.length ? `, ${flagged.length} flagged` : ''}` : String(lead.value),
            units: params.length > 1 ? '' : String(lead.unit ?? ''),
            referenceRange: params.length > 1 ? 'see parameters' : String(lead.referenceRange ?? ''),
            observedAt: o.observedAt ?? o.verifiedAt ?? o.orderedAt,
            comments: o.pathologistNotes ?? '',
            verifiedBy: o.verifiedBy,
            verifiedAt: o.verifiedAt,
            releasedAt: o.verifiedAt,
            status: STATUS_FOR_DOCTOR[o.status],
            parameters: params
          }
        : undefined
    };
  };
  const labsFor = (p: any) =>
    db().labOrders.filter((o: any) => o.status !== 'cancelled' && (o.registeredPatientRef === p.id || (!o.external && o.patientId === p.patientId)));

  // Imported results count in charts only when nothing about them is waiting for review.
  const IMPORT_OK = ['Imported', 'Linked (reviewed)'];
  const importedFor = (p: any) => db().externalRecords.filter((r: any) => r.patientId === p.id && r.status !== 'Unmatched');

  const chartFor = (p: any) => {
    const points: any[] = [];
    for (const o of labsFor(p)) {
      if (!['verified', 'released'].includes(o.status)) continue;
      for (const r of o.results ?? []) {
        const v = num(r.value);
        if (v === null) continue;
        points.push({ date: o.observedAt ?? o.verifiedAt ?? o.orderedAt, value: v, units: r.unit ?? '', range: r.referenceRange ?? '', test: r.parameter, status: 'Released to Doctor', source: 'CareWeave Laboratory' });
      }
    }
    for (const r of importedFor(p)) {
      if (r.kind !== 'lab' || !IMPORT_OK.includes(r.status)) continue;
      const v = num(r.content?.value);
      if (v === null) continue;
      points.push({ date: r.eventDate, value: v, units: r.content.units ?? '', range: r.content.referenceRange ?? '', test: r.content.testName, status: 'Imported', source: r.facility });
    }
    return points.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  };

  const timelineFor = (p: any) => {
    const ev: any[] = [];
    for (const e of db().encounters.filter((x: any) => x.patientId === p.id))
      ev.push({ id: e.id, type: 'Consultation', date: e.date, title: e.diagnosis || 'Clinical consultation', detail: e.notes || e.assessment || 'Encounter recorded in CareWeave.', source: e.source || 'CareWeave Clinic', reference: e.id, imported: false });
    for (const o of labsFor(p)) {
      const d = doctorLab(o);
      const flagged = (o.results ?? []).filter((r: any) => r.flag && r.flag !== 'normal').map((r: any) => r.parameter);
      ev.push({
        id: o.id, type: 'Lab result', date: o.observedAt ?? o.orderedAt, title: o.testName,
        detail: d.result ? `${d.result.value}${d.result.units ? ' ' + d.result.units : ''}${flagged.length ? ` · flagged: ${flagged.join(', ')}` : ''}${d.amended ? ` · amended ${d.amended}x` : ''}` : 'Ordered. Values are shown after laboratory verification.',
        source: o.verifiedBy ? `Verified by ${o.verifiedBy}` : 'CareWeave Laboratory', reference: o.id, status: d.status, imported: false, meta: { parameters: d.result?.parameters }
      });
    }
    for (const r of db().prescriptions.filter((x: any) => x.patientId === p.id))
      ev.push({ id: r.id, type: 'Prescription', date: r.date, title: `${r.medicine} · ${r.dosage}`, detail: [r.route, r.frequency, r.duration].filter(Boolean).join(' · ') + (r.status && r.status !== 'Active' ? ` [${r.status}]` : ''), source: r.source || 'CareWeave Clinic', reference: r.id, imported: !!r.imported });
    for (const r of importedFor(p))
      ev.push({ id: r.id, type: 'Imported record', date: r.eventDate, title: `${r.kind} from ${r.facility}`, detail: summarize(r), source: r.facility, reference: r.sourceRecordId || r.id, imported: true, status: r.status });
    for (const rf of db().referrals.filter((x: any) => x.patientId === p.id))
      ev.push({ id: rf.id, type: 'Referral', date: rf.date, title: `Referral: ${rf.specialty}`, detail: `${rf.providerName} · ${rf.reason}`, source: 'CareWeave Clinic', reference: rf.id, status: rf.status });
    for (const v of db().vitals.filter((x: any) => x.patientId === p.id))
      ev.push({ id: v.id, type: 'Vitals', date: v.date, title: `Vitals: BP ${v.bpSystolic ?? '-'}/${v.bpDiastolic ?? '-'}`, detail: [v.heartRate != null && `HR ${v.heartRate} bpm`, v.spo2 != null && `SpO2 ${v.spo2}%`, v.tempF != null && `Temp ${v.tempF} F`, v.bmi != null && `BMI ${v.bmi}`].filter(Boolean).join(' · '), source: v.recordedBy || 'CareWeave Clinic', reference: v.id });
    return ev.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };
  const summarize = (r: any) => {
    const x = r.content ?? {};
    return r.kind === 'lab' ? `${x.testName ?? 'Test'}: ${x.value ?? '?'} ${x.units ?? ''}`.trim() + ` · ${r.status}`
      : r.kind === 'medication' ? `${x.medicine ?? 'Medicine'} ${x.dosage ?? ''} ${x.frequency ?? ''}`.replace(/\s+/g, ' ').trim() + ` · ${r.status}`
      : `${x.diagnosis ?? 'Consultation'} · ${r.status}`;
  };

  // ── dashboard, record ─────────────────────────────────────────────────────
  const casesFor = (req: any) => {
    const linked = linkedPatientIds(req.user.id);
    return db().cases.filter((k: any) => k.status === 'open' && (k.importedBy === req.user.id || (k.patientId && linked.has(k.patientId))));
  };

  const doctorDashboard = (req: any) => {
    const mine = db().appointments.filter((a: any) => a.doctorId === req.user.id);
    const today = mine.filter((a: any) => c.isToday(a.date));
    const linked = linkedPatientIds(req.user.id);
    const labs = db().labOrders.filter((o: any) => o.status !== 'cancelled' && (o.createdBy === req.user.id || o.orderingDoctor === req.user.name || (o.registeredPatientRef && linked.has(o.registeredPatientRef)))).map(doctorLab);
    return {
      stats: {
        patients: linked.size,
        appointments: today.length,
        waiting: mine.filter((a: any) => ['Waiting', 'Checked In'].includes(a.status)).length,
        checkedIn: mine.filter((a: any) => a.status === 'Checked In').length,
        completed: today.filter((a: any) => a.status === 'Completed').length,
        released: labs.filter((l: any) => l.status === 'Released to Doctor').length,
        awaitingVerification: labs.filter((l: any) => l.status === 'Awaiting Verification').length,
        openCases: casesFor(req).length
      },
      appointments: today.sort((a: any, b: any) => String(a.time).localeCompare(String(b.time))),
      labOrders: labs.slice(0, 60),
      cases: casesFor(req),
      recent: db().auditLogs.filter((l: any) => l.actorId === req.user.id).slice(-10).reverse()
    };
  };
  (app as any).locals.doctorDashboard = doctorDashboard;
  (app as any).locals.doctorLinkedPatientIds = linkedPatientIds;

  // A walk-in or newly registered patient has no booking yet. A doctor who knows the exact patient ID can open the
  // chart by stating why; that creates a booking in their name, so access is explicit, limited to one patient and audited.
  app.post('/api/patients/open', roles('doctor'), async (req: any, res) => {
    const wanted = text(req.body?.patientId, 40);
    const reason = text(req.body?.reason, 200);
    if (reason.length < 5) return res.status(400).json({ error: 'Give the reason you are opening this chart (at least 5 characters)' });
    const p = wanted ? db().patients.find((x: any) => String(x.patientId).toLowerCase() === wanted.toLowerCase()) : null;
    if (!p) return res.status(404).json({ error: 'No patient with that ID. Check the ID on the patient card.' });
    if (!isLinked(req, p)) {
      const t = new Date();
      db().appointments.push({
        id: id('appt'), patientId: p.id, patientName: p.name, patientIdCode: p.patientId, doctorId: req.user.id, doctorName: req.user.name,
        date: t.toISOString().slice(0, 10), time: t.toTimeString().slice(0, 5), reason, status: 'In Consultation', openedByDoctor: true
      });
      audit(req, 'open', 'patient', p.id, `Doctor opened a chart by patient ID: ${reason}`);
      await save();
    }
    res.json(c.adminPatientView(p));
  });

  app.get('/api/patients/:id/record', roles('doctor'), (req: any, res) => {
    const p = patientFor(req, res, req.params.id);
    if (!p) return;
    audit(req, 'read', 'patient', p.id, 'Open unified health record');
    void save();
    res.json({
      ...c.adminPatientView(p),
      allergies: p.allergies || [],
      problems: p.problems || [],
      vitals: db().vitals.filter((v: any) => v.patientId === p.id),
      referrals: db().referrals.filter((r: any) => r.patientId === p.id),
      carePlans: db().carePlans.filter((x: any) => x.patientId === p.id),
      timeline: timelineFor(p),
      chart: chartFor(p),
      appointments: db().appointments.filter((a: any) => a.patientId === p.id),
      labOrders: labsFor(p).map(doctorLab),
      prescriptions: db().prescriptions.filter((r: any) => r.patientId === p.id)
    });
  });

  // ── encounters (SOAP) ─────────────────────────────────────────────────────
  app.post('/api/encounters', roles('doctor'), async (req: any, res) => {
    const p = patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const b = req.body ?? {};
    const fields = ['notes', 'diagnosis', 'chiefComplaint', 'subjective', 'objective', 'assessment', 'plan'] as const;
    const e: any = { id: id('enc'), patientId: p.id, doctorId: req.user.id, date: now(), source: 'CareWeave Clinic', imported: false };
    for (const f of fields) e[f] = text(b[f], 4000);
    if (!fields.some((f) => e[f])) return res.status(400).json({ error: 'Write at least a note, a complaint or an assessment' });
    db().encounters.unshift(e);
    if (b.vitals && typeof b.vitals === 'object') {
      const v = cleanVitals(b.vitals);
      if (v.error) return res.status(400).json({ error: v.error });
      if (v.ok) { db().vitals.unshift({ id: id('vt'), patientId: p.id, date: now(), ...v.ok, recordedBy: req.user.name }); e.vitals = v.ok; }
    }
    audit(req, 'create', 'encounter', e.id, 'SOAP documentation');
    await save();
    res.status(201).json(e);
  });

  app.patch('/api/encounters/:id', roles('doctor'), async (req: any, res) => {
    const e = db().encounters.find((x: any) => x.id === req.params.id && x.doctorId === req.user.id);
    if (!e) return res.status(404).json({ error: 'Encounter not found' });
    for (const f of ['notes', 'diagnosis', 'chiefComplaint', 'subjective', 'objective', 'assessment', 'plan']) if (req.body?.[f] !== undefined) e[f] = text(req.body[f], 4000);
    e.updatedAt = now();
    audit(req, 'update', 'encounter', e.id);
    await save();
    res.json(e);
  });

  // ── vitals, allergies, problems ───────────────────────────────────────────
  const RANGES: Record<string, [number, number]> = { bpSystolic: [40, 300], bpDiastolic: [20, 200], heartRate: [20, 300], tempF: [85, 110], respRate: [4, 80], spo2: [40, 100], bmi: [8, 80] };
  function cleanVitals(src: any): { ok?: any; error?: string } {
    const out: any = {};
    for (const [k, [lo, hi]] of Object.entries(RANGES)) {
      if (src[k] === undefined || src[k] === '' || src[k] === null) continue; // missing stays missing, never filled in
      const n = Number(src[k]);
      if (!Number.isFinite(n) || n < lo || n > hi) return { error: `${k} must be a number between ${lo} and ${hi}` };
      out[k] = n;
    }
    return Object.keys(out).length ? { ok: out } : {};
  }

  app.post('/api/patients/:id/vitals', roles('doctor'), async (req: any, res) => {
    const p = patientFor(req, res, req.params.id);
    if (!p) return;
    const v = cleanVitals(req.body ?? {});
    if (v.error) return res.status(400).json({ error: v.error });
    if (!v.ok) return res.status(400).json({ error: 'Enter at least one measurement' });
    const row = { id: id('vt'), patientId: p.id, date: now(), ...v.ok, recordedBy: req.user.name };
    db().vitals.unshift(row);
    audit(req, 'create', 'vitals', row.id, 'Vitals recorded');
    await save();
    res.status(201).json(row);
  });

  app.post('/api/patients/:id/allergies', roles('doctor'), async (req: any, res) => {
    const p = patientFor(req, res, req.params.id);
    if (!p) return;
    const allergen = text(req.body?.allergen, 120);
    if (!allergen) return res.status(400).json({ error: 'Name the allergen' });
    const al = { id: id('al'), allergen, severity: ['Mild', 'Moderate', 'Severe / Anaphylaxis'].includes(req.body?.severity) ? req.body.severity : 'Moderate', reaction: text(req.body?.reaction, 200) };
    (p.allergies ||= []).unshift(al);
    audit(req, 'create', 'allergy', al.id, 'Allergy documented');
    await save();
    res.status(201).json(al);
  });

  app.post('/api/patients/:id/problems', roles('doctor'), async (req: any, res) => {
    const p = patientFor(req, res, req.params.id);
    if (!p) return;
    const name = text(req.body?.name, 160);
    if (!name) return res.status(400).json({ error: 'Name the problem' });
    const pr = { id: id('pr'), code: text(req.body?.code, 20), name, status: ['Active', 'Resolved', 'Chronic'].includes(req.body?.status) ? req.body.status : 'Active', diagnosedDate: now() };
    (p.problems ||= []).unshift(pr);
    audit(req, 'create', 'problem', pr.id, 'Problem added');
    await save();
    res.status(201).json(pr);
  });

  // ── referrals and care plans ──────────────────────────────────────────────
  const mineByPatient = (req: any, rows: any[]) => {
    const linked = linkedPatientIds(req.user.id);
    return rows.filter((r) => linked.has(r.patientId));
  };

  app.get('/api/referrals', roles('doctor'), (req: any, res) => {
    audit(req, 'read', 'referral', 'directory');
    res.json(mineByPatient(req, db().referrals));
  });
  app.post('/api/referrals', roles('doctor'), async (req: any, res) => {
    const p = patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const reason = text(req.body?.reason, 500);
    if (!reason) return res.status(400).json({ error: 'Give the reason for the referral' });
    const rf = {
      id: id('ref'), patientId: p.id, patientName: p.name, patientIdCode: p.patientId,
      specialty: text(req.body?.specialty, 80) || 'Specialist', providerName: text(req.body?.providerName, 120),
      priority: ['Routine', 'Semi-urgent', 'Urgent'].includes(req.body?.priority) ? req.body.priority : 'Routine',
      reason, clinicalSummary: text(req.body?.clinicalSummary, 2000), date: now(), status: 'Drafted', createdBy: req.user.id
    };
    db().referrals.unshift(rf);
    audit(req, 'create', 'referral', rf.id, `Referral to ${rf.specialty}`);
    await save();
    res.status(201).json(rf);
  });
  app.patch('/api/referrals/:id', roles('doctor'), async (req: any, res) => {
    const rf = mineByPatient(req, db().referrals).find((x: any) => x.id === req.params.id);
    if (!rf) return res.status(404).json({ error: 'Referral not found' });
    if (!['Drafted', 'Sent', 'Scheduled', 'Completed'].includes(req.body?.status)) return res.status(400).json({ error: 'Unknown referral status' });
    rf.status = req.body.status;
    audit(req, 'update', 'referral', rf.id, `Status: ${rf.status}`);
    await save();
    res.json(rf);
  });

  app.get('/api/care-plans', roles('doctor'), (req: any, res) => {
    audit(req, 'read', 'care-plan', 'directory');
    res.json(mineByPatient(req, db().carePlans));
  });
  app.post('/api/care-plans', roles('doctor'), async (req: any, res) => {
    const p = patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const title = text(req.body?.title, 160);
    if (!title) return res.status(400).json({ error: 'Give the care plan a title' });
    const cp = {
      id: id('cp'), patientId: p.id, patientName: p.name, title, category: text(req.body?.category, 80) || 'General',
      goals: Array.isArray(req.body?.goals) ? req.body.goals.slice(0, 20).map((g: any) => text(g, 200)).filter(Boolean) : [],
      targets: Array.isArray(req.body?.targets) ? req.body.targets.slice(0, 20) : [],
      nextReviewDate: text(req.body?.nextReviewDate, 40) || now(), status: 'Active', createdBy: req.user.id
    };
    db().carePlans.unshift(cp);
    audit(req, 'create', 'care-plan', cp.id, 'Care plan started');
    await save();
    res.status(201).json(cp);
  });
  app.patch('/api/care-plans/:id', roles('doctor'), async (req: any, res) => {
    const cp = mineByPatient(req, db().carePlans).find((x: any) => x.id === req.params.id);
    if (!cp) return res.status(404).json({ error: 'Care plan not found' });
    if (req.body?.status && ['Active', 'Completed', 'Under Review'].includes(req.body.status)) cp.status = req.body.status;
    if (Array.isArray(req.body?.targets)) cp.targets = req.body.targets.slice(0, 20);
    audit(req, 'update', 'care-plan', cp.id);
    await save();
    res.json(cp);
  });

  // ── lab orders (the laboratory itself works through /api/lab/*) ───────────
  app.get('/api/lab-orders', roles('doctor'), (req: any, res) => {
    const linked = linkedPatientIds(req.user.id);
    audit(req, 'read', 'lab-order', 'directory');
    res.json(db().labOrders.filter((o: any) => o.status !== 'cancelled' && (o.createdBy === req.user.id || (o.registeredPatientRef && linked.has(o.registeredPatientRef)))).map(doctorLab));
  });

  app.post('/api/lab-orders', roles('doctor'), async (req: any, res) => {
    const p = patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const testName = text(req.body?.testName, 120);
    if (!testName) return res.status(400).json({ error: 'Choose the test to order' });
    // Every order is tied to a visit: the one named, else this doctor's latest encounter, else an open appointment.
    const wanted = text(req.body?.encounterId, 60);
    const enc = db().encounters.find((e: any) => e.patientId === p.id && e.doctorId === req.user.id && (!wanted || e.id === wanted))
      ?? db().appointments.find((a: any) => a.patientId === p.id && a.doctorId === req.user.id && !['Cancelled', 'No Show'].includes(a.status) && (!wanted || a.id === wanted));
    if (!enc) return res.status(400).json({ error: 'Open an encounter (SOAP note) or have an appointment for this patient before ordering a test' });
    const orderId = `ORD-${Date.now().toString().slice(-7)}${crypto.randomInt(10, 99)}`;
    const o: any = {
      id: orderId, external: false, patientId: p.patientId, registeredPatientRef: p.id, patientName: p.name,
      patientAge: ageFromDob(p.dob), patientGender: p.gender || 'O', encounterId: enc.id, testName,
      orderingDoctor: req.user.name, referralDoctor: req.user.name, orderedAt: now(), registrationAt: now(), status: 'requested',
      priority: /urgent|stat/i.test(String(req.body?.priority)) ? 'urgent' : 'routine',
      sampleType: text(req.body?.sampleType, 80) || undefined, handlingNote: text(req.body?.clinicalIndication, 500) || undefined,
      amendments: [], attachments: [], createdBy: req.user.id
    };
    db().labOrders.unshift(o);
    audit(req, 'create', 'lab-order', o.id, `Doctor order: ${testName} (${o.priority})`);
    await save();
    res.status(201).json(doctorLab(o));
  });

  // A doctor may withdraw an order the lab has not started on. Everything else is the laboratory's call.
  app.patch('/api/lab-orders/:id/status', roles('doctor'), async (req: any, res) => {
    const o = db().labOrders.find((x: any) => x.id === req.params.id && x.createdBy === req.user.id);
    if (!o) return res.status(404).json({ error: 'Lab order not found' });
    if (!['requested', 'collection_pending'].includes(o.status)) return res.status(409).json({ error: 'The laboratory has already started this order' });
    const reason = text(req.body?.reason, 300);
    if (!reason) return res.status(400).json({ error: 'Give a reason for withdrawing the order' });
    o.status = 'cancelled';
    o.statusReason = reason;
    o.updatedAt = now();
    audit(req, 'status:cancelled', 'labOrder', o.id, reason);
    await save();
    res.json(doctorLab(o));
  });

  // ── prescriptions ─────────────────────────────────────────────────────────
  // Duplicate-therapy check: the same active molecule under another brand, in-house or from a linked outside record.
  const duplicateAlerts = (p: any, medicine: string, dosage: string, frequency: string) =>
    checkDuplicateTherapy({
      medicine, dosage, frequency,
      prescriptions: db().prescriptions.filter((r: any) => r.patientId === p.id),
      externalRecords: db().externalRecords.filter((r: any) => r.patientId === p.id),
      // A bare brand name such as "Dolo" is looked up in the catalogue to find its generic composition.
      resolve: async (name) => {
        const first = name.trim().split(/[\s-]+/)[0].toLowerCase();
        const hit = (await searchMedicines(name, 3, c.mongoConnected?.() ?? false)).find((m) => m.brand.toLowerCase().startsWith(first));
        return hit?.generic;
      },
    });

  app.post('/api/encounters/validate-prescription', roles('doctor'), async (req: any, res) => {
    const p = patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const medicine = text(req.body?.medicine, 200);
    if (!medicine) return res.status(400).json({ error: 'Name the medicine to check' });
    const alerts = await duplicateAlerts(p, medicine, text(req.body?.dosage, 80), text(req.body?.frequency, 80));
    res.json({ alerts, blocking: alerts.some((a) => a.severity === 'HIGH_COLLISION') });
  });

  app.post('/api/prescriptions', roles('doctor'), async (req: any, res) => {
    const p = patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const b = req.body ?? {};
    const medicine = text(b.medicine, 120), dosage = text(b.dosage, 80), frequency = text(b.frequency, 80);
    if (!medicine || !dosage || !frequency) return res.status(400).json({ error: 'Medicine, dose and frequency are required' });
    const enc = db().encounters.find((e: any) => e.patientId === p.id && e.doctorId === req.user.id && (!b.encounterId || e.id === b.encounterId));
    if (!enc) return res.status(400).json({ error: 'Document an encounter for this patient first, so the prescription is linked to it' });
    const allergy = (p.allergies || []).find((a: any) => conflictsWith(String(a.allergen), medicine));
    if (allergy && !text(b.allergyOverrideReason)) {
      audit(req, 'blocked', 'prescription', p.id, 'Allergy conflict');
      await save();
      return res.status(409).json({ error: `Allergy on record: ${allergy.allergen} (${allergy.severity}). Choose another medicine, or send an override reason.` });
    }
    const alerts = await duplicateAlerts(p, medicine, dosage, frequency);
    const high = alerts.filter((x) => x.severity === 'HIGH_COLLISION');
    const ov = b.duplicateOverride;
    const overrideOk = !!ov && ov.acknowledgedRisks === true && text(ov.overrideReason, 500).length >= 15;
    const molecules = [...new Set(high.flatMap((x) => x.matchedMolecules))].join(', ');
    if (high.length && !overrideOk) {
      audit(req, 'blocked', 'prescription', p.id, `Duplicate therapy: ${medicine} repeats ${molecules} already given as ${high.map((x) => x.conflictingDrug.name).join('; ')}`);
      await save();
      return res.status(409).json({
        error: `Duplicate therapy: ${molecules} is already being taken. Cancel, or send an override reason of at least 15 characters and acknowledge the risks.`,
        code: 'DUPLICATE_THERAPY', alerts, overrideRequired: { overrideReason: 'string (min 15 characters)', acknowledgedRisks: true },
      });
    }
    const r = {
      id: id('rx'), patientId: p.id, encounterId: enc.id, medicine, dosage, route: text(b.route, 40), frequency,
      duration: text(b.duration, 60), instructions: text(b.instructions, 500), refills: Math.max(0, Math.min(12, Number(b.refills) || 0)),
      status: 'Active', date: now(), source: 'CareWeave Clinic', prescribingClinician: req.user.name, imported: false,
      allergyOverrideReason: allergy ? text(b.allergyOverrideReason, 300) : undefined,
      duplicateOverride: high.length ? { reason: text(ov.overrideReason, 500), acknowledgedRisks: true, molecules: high.flatMap((x) => x.matchedMolecules), conflictsWith: high.map((x) => x.conflictingDrug.name) } : undefined
    };
    db().prescriptions.unshift(r);
    audit(req, 'create', 'prescription', r.id, `${medicine} ${dosage}${allergy ? ' (allergy override)' : ''}`);
    if (high.length) audit(req, 'override', 'prescription', r.id, `Duplicate therapy override for ${molecules}: ${text(ov.overrideReason, 500)}`);
    await save();
    res.status(201).json(r);
  });

  app.patch('/api/prescriptions/:id', roles('doctor'), async (req: any, res) => {
    const r = db().prescriptions.find((x: any) => x.id === req.params.id && x.prescribingClinician === req.user.name);
    if (!r) return res.status(404).json({ error: 'Prescription not found' });
    if (req.body?.status) {
      if (!['Active', 'Discontinued', 'Completed'].includes(req.body.status)) return res.status(400).json({ error: 'Unknown prescription status' });
      if (req.body.status === 'Discontinued' && !text(req.body.discontinueReason)) return res.status(400).json({ error: 'Give a reason for stopping this medicine' });
      r.status = req.body.status;
    }
    if (req.body?.refills !== undefined) r.refills = Math.max(0, Math.min(12, Number(req.body.refills) || 0));
    if (req.body?.discontinueReason) r.discontinueReason = text(req.body.discontinueReason, 300);
    audit(req, 'update', 'prescription', r.id, `Status: ${r.status}`);
    await save();
    res.json(r);
  });

  // ── external records and reconciliation ───────────────────────────────────
  const caseFrom = (rec: any, patientId: string | null, issue: Issue | { type: 'match' | 'unmatched'; title: string; detail: string; evidence: string[]; candidates?: any[] }, importedBy: string) => ({
    id: id('case'), type: issue.type, title: issue.title, detail: issue.detail, reference: rec.sourceRecordId || rec.id,
    evidence: issue.evidence, sideBySide: (issue as any).sideBySide, candidates: (issue as any).candidates,
    recordId: rec.id, patientId, importedBy, status: 'open', createdAt: now()
  });

  /** Run the duplicate and conflict checks for a record that now belongs to a patient. */
  const analyze = (rec: any, p: any, by: string) => {
    const others = db().externalRecords.filter((r: any) => r.patientId === p.id && r.id !== rec.id);
    const labs = labsFor(p).filter((o: any) => ['verified', 'released'].includes(o.status));
    const rx = db().prescriptions.filter((r: any) => r.patientId === p.id);
    const issues = findIssues(rec, others, labs, rx);
    for (const i of issues) db().cases.unshift(caseFrom(rec, p.id, i, by));
    rec.status = issues.some((i) => i.type === 'conflict') ? 'Conflict flagged' : issues.length ? 'Duplicate flagged' : 'Imported';
    return issues;
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

  app.post('/api/external-records/import', roles('doctor'), async (req: any, res) => {
    const list = Array.isArray(req.body?.records) ? req.body.records : [req.body];
    if (list.length > 200) return res.status(400).json({ error: 'Import at most 200 records at a time' });
    const out: any[] = [];
    for (const raw of list) {
      const v = validRecord({ ...raw, facility: raw?.facility ?? req.body?.facility });
      if (!v.ok) { out.push({ error: v.error, sourceRecordId: raw?.sourceRecordId }); continue; }
      const { who, ...base } = v.ok;
      const rec: any = { id: id('ext'), ...base, patientId: null, importedAt: now(), importedBy: req.user.id, importedByName: req.user.name, checksum: checksum(base.content), identity: who, status: 'Requires review' };
      db().externalRecords.unshift(rec);
      const m = matchPatient(db().patients, who);
      const issues: any[] = [];
      if (m.status === 'linked') {
        rec.patientId = m.candidate.patient.id;
        rec.matchEvidence = m.candidate.evidence;
        issues.push(...analyze(rec, m.candidate.patient, req.user.id));
      } else if (m.status === 'ambiguous') {
        rec.status = 'Requires review (identity)';
        const cands = m.candidates.map((x) => ({ patientId: x.patient.patientId, id: x.patient.id, name: x.patient.name, score: x.score, evidence: x.evidence, conflicts: x.conflicts }));
        const k = caseFrom(rec, null, { type: 'match', title: 'Possible patient match needs review', detail: `${rec.facility} · ${rec.sourceRecordId || rec.id}: ${cands.length} possible patient(s). Nothing was linked.`, evidence: ['Similar details are not proof of identity', ...(cands[0]?.evidence ?? []), ...(cands[0]?.conflicts ?? [])], candidates: cands }, req.user.id);
        db().cases.unshift(k);
        issues.push(k);
      } else {
        rec.status = 'Unmatched';
        const k = caseFrom(rec, null, { type: 'unmatched', title: 'No matching patient', detail: `${rec.facility} · ${rec.sourceRecordId || rec.id} stays separate until a reviewer links it to a patient.`, evidence: ['No patient scored high enough on the identity fields supplied'] }, req.user.id);
        db().cases.unshift(k);
        issues.push(k);
      }
      audit(req, 'import', 'external-record', rec.id, `Source: ${rec.facility} · ${rec.status}`);
      out.push({ record: rec, outcome: rec.status, cases: db().cases.filter((k: any) => k.recordId === rec.id) });
    }
    await save();
    const failed = out.filter((x) => x.error).length;
    res.status(out.length && failed === out.length ? 400 : 201).json({ results: out, imported: out.length - failed, rejected: failed, ...(out[0]?.record ? { record: out[0].record, case: out[0].cases?.[0] } : { error: out[0]?.error }) });
  });

  app.get('/api/reconciliation/cases', roles('doctor'), (req: any, res) => {
    audit(req, 'read', 'reconciliation', 'queue');
    res.json(casesFor(req));
  });

  app.patch('/api/reconciliation/cases/:id', roles('doctor'), async (req: any, res) => {
    const k = casesFor(req).find((x: any) => x.id === req.params.id);
    if (!k) return res.status(404).json({ error: 'Review case not found' });
    const decision = req.body?.decision;
    if (!['keep-separate', 'link'].includes(decision)) return res.status(400).json({ error: 'Decision must be keep-separate or link' });
    const rec = db().externalRecords.find((r: any) => r.id === k.recordId);
    if (!rec) return res.status(404).json({ error: 'The imported record no longer exists' });

    if (decision === 'keep-separate') {
      rec.status = 'Kept separate';
    } else if (k.type === 'match' || k.type === 'unmatched') {
      // The reviewer chooses the patient. It must be one this doctor is linked to.
      const wanted = text(req.body?.linkPatientId, 60) || k.candidates?.[0]?.id;
      const p = wanted ? c.patientById(wanted) : null;
      if (!p) return res.status(400).json({ error: 'Choose the patient to link this record to' });
      if (!isLinked(req, p)) return res.status(403).json({ error: 'You are not linked to that patient' });
      rec.patientId = p.id;
      rec.status = 'Linked (reviewed)';
      analyze(rec, p, req.user.id);
      if (rec.status !== 'Imported') { /* new duplicate or conflict cases were opened for the reviewer */ } else rec.status = 'Linked (reviewed)';
    } else if (k.type === 'duplicate') {
      rec.status = 'Duplicate (linked to original)';
    } else {
      rec.status = 'Linked (reviewed)';
    }
    k.status = 'reviewed';
    k.decision = decision;
    k.reviewedBy = req.user.name;
    k.reviewedAt = now();
    audit(req, 'resolve', 'reconciliation-case', k.id, `Decision: ${decision}`);
    await save();
    res.json(k);
  });

  function ageFromDob(dob: string) {
    const d = new Date(dob);
    if (isNaN(+d)) return 0;
    const n = new Date();
    let a = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
    return Math.max(0, a);
  }
}
