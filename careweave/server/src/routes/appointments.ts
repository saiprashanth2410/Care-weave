import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { expectedVersion } from '../middleware.js';
import { DuplicateError } from '../repo/index.js';
import { slotKeyOf } from '../repo/appointments.js';
import { id, isToday, now } from '../util.js';
import { linkedPatientIds } from '../services/access.js';
import { nextToken, queueAhead, roomFor } from '../whatsapp/messages.js';
import { emitEvent } from '../whatsapp/emitter.js';
import { isoToday } from '../util.js';

const STATUSES = ['Scheduled', 'Checked In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled', 'No Show'];

export function appointmentRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;

  // Doctor list for receptionist appointment booking
  router.get('/doctors', roles('receptionist', 'doctor', 'lab'), async (_req, res) => {
    const doctors = (await ctx.repos.users.byRole('doctor')).map((u: any) => ({ id: u.id, name: u.name, facility: u.facility }));
    res.json(doctors);
  });

  router.get('/appointments', roles('receptionist', 'doctor'), async (req: any, res) => {
    const { date, status, patientId } = req.query as any;
    const filter: Record<string, any> = {};
    if (req.user.role === 'doctor') filter.doctorId = req.user.id;
    if (status) filter.status = status;
    if (patientId) filter.patientId = patientId;
    let rows = await ctx.repos.appointments.find(filter);
    if (date === 'today') rows = rows.filter((a: any) => isToday(a.date));
    res.json(rows);
  });

  router.post('/appointments', roles('receptionist', 'doctor'), async (req: any, res) => {
    const p = await ctx.repos.patients.byRef(String(req.body?.patientId ?? ''));
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    if (req.user.role === 'doctor') {
      if (!(await linkedPatientIds(ctx.repos, req.user.id)).has(p.id)) return res.status(403).json({ error: 'You are not linked to this patient' });
      req.body.doctorId = req.user.id;
    }
    const { date, time, reason, doctorId } = req.body;
    if (typeof date !== 'string' || typeof time !== 'string' || !date || !time) return res.status(400).json({ error: 'Date and time are required' });
    if (typeof reason !== 'string' || !reason.trim()) return res.status(400).json({ error: 'Reason for appointment is required' });

    if (await ctx.repos.appointments.patientSlot(p.id, date, time)) return res.status(409).json({ error: `Patient already has an appointment at ${time} on ${date}` });

    const doctor = doctorId ? await ctx.repos.users.byId(doctorId) : (await ctx.repos.users.byRole('doctor'))[0];
    const taken = doctor && await ctx.repos.appointments.doctorSlot(doctor.id, date, time);
    if (taken) return res.status(409).json({ error: `${doctor.name} already has a booking at ${time} on ${date}. Choose another time.` });
    const draft = {
      id: id('appt'),
      patientId: p.id,
      patientName: p.name,
      patientIdCode: p.patientId,
      doctorId: doctor?.id || '',
      doctorName: doctor?.name || 'Unassigned',
      date,
      time,
      reason: String(reason).trim(),
      status: 'Scheduled'
    };
    let a;
    try {
      // The unique slotKey is what stops two requests booking one slot at once; the check above only gives a friendlier message.
      a = await ctx.repos.appointments.insert({ ...draft, slotKey: slotKeyOf(draft) });
    } catch (err) {
      if (err instanceof DuplicateError) return res.status(409).json({ error: `${doctor?.name ?? 'The doctor'} already has a booking at ${time} on ${date}. Choose another time.` });
      throw err;
    }
    await audit(req, 'create', 'appointment', a.id, `${p.name} · ${date} ${time}`);
    res.status(201).json(a);
  });

  router.patch('/appointments/:id', roles('receptionist', 'doctor'), async (req: any, res) => {
    const a = await ctx.repos.appointments.byId(req.params.id);
    if (!a) return res.status(404).json({ error: 'Appointment not found' });
    const { status, date, time, reason } = req.body || {};
    if ([status, date, time, reason].some((v) => v !== undefined && typeof v !== 'string')) return res.status(400).json({ error: 'Status, date, time and reason must be text' });
    const expected = expectedVersion(req, a);
    // Check the new slot before changing anything, so a refusal leaves the appointment untouched.
    const nd = date || a.date, nt = time || a.time;
    const taken = (date || time) && a.doctorId && await ctx.repos.appointments.doctorSlot(a.doctorId, nd, nt, a.id);
    if (taken) return res.status(409).json({ error: `${a.doctorName} already has a booking at ${nt} on ${nd}. Choose another time.` });

    const changes: Record<string, any> = {};
    let issuedToken: string | undefined;
    if (status) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid appointment status' });
      if (status === a.status) return res.status(409).json({ error: `Patient is already marked as ${status}` });
      changes.status = status;
      if ((status === 'Checked In' || status === 'Waiting') && !a.checkedInAt) changes.checkedInAt = now();
      if ((status === 'Checked In' || status === 'Waiting') && !a.token) {
        const day = await ctx.repos.appointments.onDay(isoToday());
        issuedToken = nextToken({ appointments: a.date === 'Today' || isToday(a.date) ? day : await ctx.repos.appointments.find({ date: a.date }) }, a.date);
        changes.token = issuedToken;
      }
      // Analytics measures the wait as check-in to the start of the consultation, so both moments are recorded.
      if (status === 'In Consultation' && !a.startedAt) changes.startedAt = now();
      if (status === 'Completed' && !a.completedAt) changes.completedAt = now();
    }
    if (date || time) {
      if (!['Scheduled'].includes(changes.status ?? a.status) && !status) {
        return res.status(400).json({ error: 'Only scheduled appointments can be rescheduled' });
      }
      changes.date = nd;
      changes.time = nt;
      changes.rescheduledAt = now();
    }
    if (reason) changes.reason = String(reason).trim();
    changes.slotKey = slotKeyOf({ ...a, ...changes });
    let saved;
    try {
      saved = await ctx.repos.appointments.update(a, changes, expected);
    } catch (err) {
      if (err instanceof DuplicateError) return res.status(409).json({ error: `${a.doctorName} already has a booking at ${nt} on ${nd}. Choose another time.` });
      throw err;
    }
    await audit(req, 'update', 'appointment', a.id, `Status: ${saved.status}${date ? ` · Rescheduled to ${saved.date} ${saved.time}` : ''}`);
    if (issuedToken) {
      const pt = await ctx.repos.patients.byRef(a.patientId);
      const queue = { appointments: [...(await ctx.repos.appointments.onDay(isoToday()))] };
      emitEvent('PATIENT_CHECKED_IN', {
        patientId: a.patientIdCode || pt?.patientId, name: a.patientName, phone: pt?.phone, token: issuedToken, doctor: a.doctorName,
        room: roomFor(a.doctorName), triagePriority: a.priority || 'Normal OPD', queuePosition: queueAhead(queue, saved) + 1
      });
    }
    res.json(saved);
  });

  return router;
}
