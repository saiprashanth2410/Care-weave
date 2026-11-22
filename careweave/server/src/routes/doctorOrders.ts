import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import type { DoctorAccess } from './doctorAccess.js';
import crypto from 'node:crypto';
import { expectedVersion } from '../middleware.js';
import { ageFromDob, id, now, text } from '../util.js';
import { linkedPatientIds } from '../services/access.js';
import { doctorLab } from '../services/chart.js';


// Doctor API: referrals, care plans and lab orders.
export function doctorOrderRoutes(ctx: AppCtx, access: DoctorAccess) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;
  const { R, patientFor, mine } = access;

  // ── referrals and care plans ──────────────────────────────────────────────
  router.get('/referrals', roles('doctor'), async (req, res) => {
    await audit(req, 'read', 'referral', 'directory');
    res.json(await R().referrals.newestFirst({ patientId: { $in: await mine(req) } }));
  });
  router.post('/referrals', roles('doctor'), async (req, res) => {
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
  router.patch('/referrals/:id', roles('doctor'), async (req, res) => {
    const rf = await R().referrals.byId(req.params.id);
    if (!rf || !(await mine(req)).includes(rf.patientId)) return res.status(404).json({ error: 'Referral not found' });
    if (!['Drafted', 'Sent', 'Scheduled', 'Completed'].includes(req.body?.status)) return res.status(400).json({ error: 'Unknown referral status' });
    const saved = await R().referrals.update(rf, { status: req.body.status }, expectedVersion(req, rf));
    await audit(req, 'update', 'referral', rf.id, `Status: ${saved.status}`);
    res.json(saved);
  });

  router.get('/care-plans', roles('doctor'), async (req, res) => {
    await audit(req, 'read', 'care-plan', 'directory');
    res.json(await R().carePlans.newestFirst({ patientId: { $in: await mine(req) } }));
  });
  router.post('/care-plans', roles('doctor'), async (req, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const title = text(req.body?.title, 160);
    if (!title) return res.status(400).json({ error: 'Give the care plan a title' });
    const cp = await R().carePlans.insert({
      id: id('cp'), patientId: p.id, patientName: p.name, title, category: text(req.body?.category, 80) || 'General',
      goals: Array.isArray(req.body?.goals) ? req.body.goals.slice(0, 20).map((g: unknown) => text(g, 200)).filter(Boolean) : [],
      targets: Array.isArray(req.body?.targets) ? req.body.targets.slice(0, 20) : [],
      nextReviewDate: text(req.body?.nextReviewDate, 40) || now(), status: 'Active', createdBy: req.user.id, createdAt: now()
    });
    await audit(req, 'create', 'care-plan', cp.id, 'Care plan started');
    res.status(201).json(cp);
  });
  router.patch('/care-plans/:id', roles('doctor'), async (req, res) => {
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
  router.get('/lab-orders', roles('doctor'), async (req, res) => {
    const linked = [...(await linkedPatientIds(R(), req.user.id))];
    await audit(req, 'read', 'lab-order', 'directory');
    const rows = await R().orders.newestFirst({ status: { $ne: 'cancelled' }, $or: [{ createdBy: req.user.id }, { registeredPatientRef: { $in: linked } }] });
    res.json(rows.map(doctorLab));
  });

  router.post('/lab-orders', roles('doctor'), async (req, res) => {
    const p = await patientFor(req, res, req.body?.patientId);
    if (!p) return;
    const testName = text(req.body?.testName, 120);
    if (!testName) return res.status(400).json({ error: 'Choose the test to order' });
    // Every order is tied to a visit: the one named, else this doctor's latest encounter, else an open appointment.
    const wanted = text(req.body?.encounterId, 60);
    const enc = (await R().encounters.forPatient(p.id)).find((e) => e.doctorId === req.user.id && (!wanted || e.id === wanted))
      ?? (await R().appointments.forPatient(p.id)).find((a) => a.doctorId === req.user.id && !['Cancelled', 'No Show'].includes(a.status) && (!wanted || a.id === wanted));
    if (!enc) return res.status(400).json({ error: 'Open an encounter (SOAP note) or have an appointment for this patient before ordering a test' });
    const draw = () => `ORD-${Date.now().toString().slice(-7)}${crypto.randomInt(10, 100)}`;
    let orderId = draw();
    while (await R().orders.byId(orderId)) orderId = draw();
    const o = await R().orders.insert({
      id: orderId, external: false, patientId: p.patientId, registeredPatientRef: p.id, patientName: p.name,
      patientAge: ageFromDob(p.dob), patientGender: p.gender || 'O', encounterId: enc.id, testName,
      orderingDoctor: req.user.name, referralDoctor: req.user.name, orderedAt: now(), registrationAt: now(), status: 'requested',
      priority: /urgent|stat/i.test(String(req.body?.priority)) ? 'urgent' : 'routine',
      sampleType: text(req.body?.sampleType, 80) || undefined, department: text(req.body?.department, 80) || undefined,
      sampleContainer: text(req.body?.sampleContainer, 120) || undefined, handlingNote: text(req.body?.clinicalIndication, 500) || undefined,
      amendments: [], attachments: [], createdBy: req.user.id
    });
    await audit(req, 'create', 'lab-order', o.id, `Doctor order: ${testName} (${o.priority})`);
    res.status(201).json(doctorLab(o));
  });

  // A doctor may withdraw an order the lab has not started on. Everything else is the laboratory's call.
  router.patch('/lab-orders/:id/status', roles('doctor'), async (req, res) => {
    const o = await R().orders.byId(req.params.id);
    if (!o || o.createdBy !== req.user.id) return res.status(404).json({ error: 'Lab order not found' });
    if (!['requested', 'collection_pending'].includes(o.status)) return res.status(409).json({ error: 'The laboratory has already started this order' });
    const reason = text(req.body?.reason, 300);
    if (!reason) return res.status(400).json({ error: 'Give a reason for withdrawing the order' });
    const saved = await R().orders.update(o, { status: 'cancelled', statusReason: reason, updatedAt: now() }, expectedVersion(req, o));
    await audit(req, 'status:cancelled', 'labOrder', o.id, reason);
    res.json(doctorLab(saved));
  });

  return router;
}
