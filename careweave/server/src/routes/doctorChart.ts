import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import type { DoctorAccess } from './doctorAccess.js';
import { expectedVersion } from '../middleware.js';
import { makeBrief } from '../clinicalSummary.js';
import { readAiConfig } from '../services/aiConfig.js';
import { adminPatientView, ageFromDob, id, now, text } from '../util.js';
import { linkedPatientIds } from '../services/access.js';
import { chartPoints, doctorLab, importedFor, labsFor, timeline } from '../services/chart.js';
import { cleanVitals } from '../services/clinical.js';


// Doctor API: opening a chart, the pre-consult brief, encounters (SOAP), vitals, allergies and problems.
export function doctorChartRoutes(ctx: AppCtx, access: DoctorAccess) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;
  const { R, patientFor } = access;

  // A walk-in or newly registered patient has no booking yet. A doctor who knows the exact patient ID can open the
  // chart by stating why; that creates a booking in their name, so access is explicit, limited to one patient and audited.
  router.post('/patients/open', roles('doctor'), async (req, res) => {
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

  router.get('/patients/:id/record', roles('doctor'), async (req, res) => {
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
  router.post('/patients/:id/summary', roles('doctor'), async (req, res) => {
    const p = await patientFor(req, res, req.params.id);
    if (!p) return;
    const t = Date.now();
    const wait = 4000 - (t - (lastBrief.get(req.user.id) ?? 0));
    if (wait > 0) {
      res.set('Retry-After', String(Math.ceil(wait / 1000)));
      return res.status(429).json({ error: 'Wait a few seconds before asking for another brief.' });
    }
    lastBrief.set(req.user.id, t);
    const [allLabs, vitalsList, prescriptions, encounters, referrals] = await Promise.all([
      labsFor(R(), p), R().vitals.forPatient(p.id, 1), R().prescriptions.forPatient(p.id), R().encounters.forPatient(p.id, 3), R().referrals.find({ patientId: p.id }),
    ]);
    const labs = allLabs.filter((o) => ['verified', 'released'].includes(o.status)).slice(0, 6)
      .flatMap((o) => (o.results ?? []).filter((r) => r.value).map((r: Record<string, any>) => ({ test: r.parameter, value: r.value, unit: r.unit, flag: r.flag, date: o.verifiedAt })));
    const ai = await readAiConfig(R());
    const brief = await makeBrief({
      ageYears: ageFromDob(p.dob), sex: p.gender || 'O',
      allergies: p.allergies || [], problems: (p.problems || []).slice(0, 12),
      vitals: vitalsList[0],
      medicines: prescriptions.filter((r) => r.status === 'Active').slice(0, 12),
      labs: labs.slice(0, 14),
      encounters,
      openItems: [
        ...referrals.filter((r) => r.status !== 'Completed').map((r) => `Referral to ${r.specialty} is ${String(r.status).toLowerCase()}`),
        ...allLabs.filter((o) => !['verified', 'released', 'cancelled'].includes(o.status)).map((o) => `${o.testName} not yet verified`),
      ].slice(0, 6),
    }, ai.features.brief ? ai.key : '', ai.model || undefined);
    await audit(req, 'read', 'summary', p.id, `Pre-consultation brief (${brief.source})`);
    res.json({ ...brief, generatedAt: now(), note: 'A reading aid made from the chart. Check it against the record before acting on it.' });
  });

  // ── encounters (SOAP) ─────────────────────────────────────────────────────
  router.post('/encounters', roles('doctor'), async (req, res) => {
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

  router.patch('/encounters/:id', roles('doctor'), async (req, res) => {
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
  router.post('/patients/:id/vitals', roles('doctor'), async (req, res) => {
    const p = await patientFor(req, res, req.params.id);
    if (!p) return;
    const v = cleanVitals(req.body ?? {});
    if (v.error) return res.status(400).json({ error: v.error });
    if (!v.ok) return res.status(400).json({ error: 'Enter at least one measurement' });
    const row = await R().vitals.insert({ id: id('vt'), patientId: p.id, date: now(), ...v.ok, recordedBy: req.user.name });
    await audit(req, 'create', 'vitals', row.id, 'Vitals recorded');
    res.status(201).json(row);
  });

  router.post('/patients/:id/allergies', roles('doctor'), async (req, res) => {
    const p = await patientFor(req, res, req.params.id);
    if (!p) return;
    const allergen = text(req.body?.allergen, 120);
    if (!allergen) return res.status(400).json({ error: 'Name the allergen' });
    const al = { id: id('al'), allergen, severity: ['Mild', 'Moderate', 'Severe / Anaphylaxis'].includes(req.body?.severity) ? req.body.severity : 'Moderate', reaction: text(req.body?.reaction, 200) };
    await R().patients.update(p, { allergies: [al, ...(p.allergies || [])] });
    await audit(req, 'create', 'allergy', al.id, 'Allergy documented');
    res.status(201).json(al);
  });

  router.post('/patients/:id/problems', roles('doctor'), async (req, res) => {
    const p = await patientFor(req, res, req.params.id);
    if (!p) return;
    const name = text(req.body?.name, 160);
    if (!name) return res.status(400).json({ error: 'Name the problem' });
    const pr = { id: id('pr'), code: text(req.body?.code, 20), name, status: ['Active', 'Resolved', 'Chronic'].includes(req.body?.status) ? req.body.status : 'Active', diagnosedDate: now() };
    await R().patients.update(p, { problems: [pr, ...(p.problems || [])] });
    await audit(req, 'create', 'problem', pr.id, 'Problem added');
    res.status(201).json(pr);
  });

  return router;
}
