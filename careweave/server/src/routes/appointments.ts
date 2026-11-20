import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { expectedVersion } from '../middleware.js';
import { DuplicateError } from '../repo/index.js';
import { patientKeyOf, slotKeyOf, tokenKeyOf } from '../repo/appointments.js';
import { id, isToday, now } from '../util.js';
import { linkedPatientIds } from '../services/access.js';
import { nextToken, queueAhead } from '../whatsapp/messages.js';
import { INACTIVE_STATUSES, WAITING_STATUSES, hhmmToMinutes, labelToMinutes, shiftOf, slotsForShift } from '../services/slots.js';
import { emitEvent } from '../whatsapp/emitter.js';
import { isoToday } from '../util.js';

/** Which of the unique guards fired: the patient already booked at that time, or the doctor's slot taken. */
const clashMessage = (err: DuplicateError, patient: string, doctor: string | undefined, date: string, time: string) =>
  err.field === 'patientKey'
    ? `${patient} already has an appointment at ${time} on ${date}`
    : `${doctor ?? 'The doctor'} already has a booking at ${time} on ${date}. Choose another time.`;

const STATUSES = ['Scheduled', 'Checked In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled', 'No Show'];

export function appointmentRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;

  // ── Doctors ────────────────────────────────────────────────────────────────
  // Everything here reads the staff directory, so a doctor an administrator adds, edits or disables shows up (or goes) everywhere at once.
  const activeDoctors = async () => (await ctx.repos.users.byRole('doctor')).filter((u: any) => u.active !== false);
  const doctorView = (u: any) => ({ id: u.id, name: u.name, facility: u.facility, room: u.room || '', shiftStart: shiftOf(u).start, shiftEnd: shiftOf(u).end });

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const HHMM_Q = /^([01]\d|2[0-3]):[0-5]\d$/;
  // The browser's own "today" and "now" are passed in: the server may be in another time zone, and "past" means past for the person at the desk.
  const dayOf = (req: any) => {
    const today = ISO_DATE.test(String(req.query.today || '')) ? String(req.query.today) : isoToday();
    const date = ISO_DATE.test(String(req.query.date || '')) ? String(req.query.date) : today;
    const now = HHMM_Q.test(String(req.query.now || '')) ? String(req.query.now) : '';
    return { date, today, now, isToday: date === today };
  };
  /** One day's appointments. Older rows wrote the date as the word "Today". */
  const rowsOn = (date: string, includeTodayWord: boolean) =>
    ctx.repos.appointments.find({ $or: [{ date: { $regex: `^${date}` } }, ...(includeTodayWord ? [{ date: 'Today' }] : [])] });
  const slim = (a: any) => ({
    id: a.id, patientName: a.patientName, patientIdCode: a.patientIdCode, time: a.time, token: a.token, status: a.status, reason: a.reason,
    checkedInAt: a.checkedInAt, startedAt: a.startedAt, completedAt: a.completedAt,
  });

  // Doctor list for receptionist appointment booking
  router.get('/doctors', roles('receptionist', 'doctor', 'lab'), async (_req, res) => {
    res.json((await activeDoctors()).map(doctorView));
  });

  // Live status of every doctor: who is with them now, how many wait, how many were seen, and the next free slot.
  router.get('/doctors/roster', roles('receptionist'), async (req: any, res) => {
    const day = dayOf(req);
    const [doctors, rows] = await Promise.all([activeDoctors(), rowsOn(day.date, day.isToday)]);
    const nowMin = day.now ? hhmmToMinutes(day.now) : null;
    res.json(doctors.map((u: any) => {
      const mine = rows.filter((a: any) => a.doctorId === u.id);
      const shift = shiftOf(u);
      const booked = new Set(mine.filter((a: any) => !INACTIVE_STATUSES.includes(a.status)).map((a: any) => a.time));
      const free = slotsForShift(shift).filter((l) => !booked.has(l) && !(day.isToday && nowMin !== null && labelToMinutes(l)! < nowMin));
      const current = mine.filter((a: any) => a.status === 'In Consultation').sort((a: any, b: any) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')))[0];
      const onShift = !(day.isToday && nowMin !== null) || (nowMin >= hhmmToMinutes(shift.start) && nowMin <= hhmmToMinutes(shift.end) + 30);
      return {
        ...doctorView(u),
        status: current ? 'in_consultation' : onShift ? 'available' : 'off_shift',
        current: current ? slim(current) : null,
        waiting: mine.filter((a: any) => WAITING_STATUSES.includes(a.status)).length,
        scheduled: mine.filter((a: any) => a.status === 'Scheduled').length,
        seen: mine.filter((a: any) => a.status === 'Completed').length,
        nextOpenSlot: free[0] || null,
        freeSlots: free.length,
      };
    }));
  });

  // Who one doctor is with, who is waiting, who is coming, and who they have seen, for a day.
  router.get('/doctors/:id/day', roles('receptionist'), async (req: any, res) => {
    const u = await ctx.repos.users.byId(String(req.params.id));
    if (!u || u.role !== 'doctor') return res.status(404).json({ error: 'Doctor not found' });
    const day = dayOf(req);
    const mine = (await rowsOn(day.date, day.isToday)).filter((a: any) => a.doctorId === u.id);
    const by = (statuses: string[]) => mine.filter((a: any) => statuses.includes(a.status));
    const minutes = (a: any) => labelToMinutes(a.time) ?? 0;
    res.json({
      doctor: doctorView(u), date: day.date,
      current: by(['In Consultation']).map(slim),
      waiting: by(WAITING_STATUSES).sort((a: any, b: any) => String(a.checkedInAt || '').localeCompare(String(b.checkedInAt || ''))).map(slim),
      upcoming: by(['Scheduled']).sort((a: any, b: any) => minutes(a) - minutes(b)).map(slim),
      seen: by(['Completed']).sort((a: any, b: any) => String(b.completedAt || '').localeCompare(String(a.completedAt || ''))).map(slim),
      notSeen: by(['Cancelled', 'No Show']).map(slim),
    });
  });

  // The slots a doctor can be booked into on a date: free ones can be picked, booked and (today) already-passed ones cannot.
  router.get('/doctors/:id/slots', roles('receptionist', 'doctor'), async (req: any, res) => {
    const u = await ctx.repos.users.byId(String(req.params.id));
    if (!u || u.role !== 'doctor' || u.active === false) return res.status(404).json({ error: 'Doctor not found' });
    const day = dayOf(req);
    const nowMin = day.now ? hhmmToMinutes(day.now) : null;
    const booked = new Set((await rowsOn(day.date, day.isToday)).filter((a: any) => a.doctorId === u.id && !INACTIVE_STATUSES.includes(a.status)).map((a: any) => a.time));
    const slots = slotsForShift(shiftOf(u)).map((time) => ({
      time,
      state: booked.has(time) ? 'booked' : (day.isToday && nowMin !== null && labelToMinutes(time)! < nowMin) ? 'past' : 'free',
    }));
    res.json({ doctor: doctorView(u), date: day.date, slots, nextFree: slots.find((x) => x.state === 'free')?.time || null });
  });

  router.get('/appointments', roles('receptionist', 'doctor'), async (req: any, res) => {
    const { date, status, patientId } = req.query as any;
    const filter: Record<string, any> = {};
    if (req.user.role === 'doctor') filter.doctorId = req.user.id;
    if (status) filter.status = status;
    if (patientId) filter.patientId = patientId;
    // "today" reads one day's rows and narrows them; anything else is a normal filtered query.
    const rows = date === 'today'
      ? (await ctx.repos.appointments.onDay(isoToday())).filter((a: any) => Object.entries(filter).every(([k, v]) => a[k] === v))
      : await ctx.repos.appointments.find(filter);
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
      a = await ctx.repos.appointments.insert({ ...draft, slotKey: slotKeyOf(draft), patientKey: patientKeyOf(draft) });
    } catch (err) {
      if (err instanceof DuplicateError) return res.status(409).json({ error: clashMessage(err, p.name, doctor?.name, date, time) });
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
    const mine = (date || time) ? await ctx.repos.appointments.patientSlot(a.patientId, nd, nt) : null;
    if (mine && mine.id !== a.id) return res.status(409).json({ error: `${a.patientName} already has an appointment at ${nt} on ${nd}` });

    const changes: Record<string, any> = {};
    let issuedToken: string | undefined;
    let needsToken = false;
    if (status) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid appointment status' });
      if (status === a.status) return res.status(409).json({ error: `Patient is already marked as ${status}` });
      changes.status = status;
      if ((status === 'Checked In' || status === 'Waiting') && !a.checkedInAt) changes.checkedInAt = now();
      if ((status === 'Checked In' || status === 'Waiting') && !a.token) needsToken = true;
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
    changes.patientKey = patientKeyOf({ ...a, ...changes });
    let saved;
    // The token is counted from today's existing tokens; the unique tokenKey is what stops two check-ins that counted at the same
    // moment (here or on another instance) from both keeping A-007. The loser counts again and takes the next number.
    for (let attempt = 0; ; attempt++) {
      if (needsToken) {
        const day = await ctx.repos.appointments.onDay(isoToday());
        issuedToken = nextToken({ appointments: a.date === 'Today' || isToday(a.date) ? day : await ctx.repos.appointments.find({ date: a.date }) }, a.date);
        changes.token = issuedToken;
        changes.tokenKey = tokenKeyOf({ token: issuedToken, date: a.date });
      }
      try {
        saved = await ctx.repos.appointments.update(a, changes, expected);
        break;
      } catch (err) {
        if (err instanceof DuplicateError && err.field === 'tokenKey' && attempt < 5) continue;
        if (err instanceof DuplicateError) return res.status(409).json({ error: clashMessage(err, a.patientName, a.doctorName, nd, nt) });
        throw err;
      }
    }
    await audit(req, 'update', 'appointment', a.id, `Status: ${saved.status}${date ? ` · Rescheduled to ${saved.date} ${saved.time}` : ''}`);
    if (issuedToken) {
      const pt = await ctx.repos.patients.byRef(a.patientId);
      const queue = { appointments: [...(await ctx.repos.appointments.onDay(isoToday()))] };
      await emitEvent('PATIENT_CHECKED_IN', {
        patientId: a.patientIdCode || pt?.patientId, name: a.patientName, phone: pt?.phone, token: issuedToken, doctor: a.doctorName,
        room: (a.doctorId && (await ctx.repos.users.byId(a.doctorId))?.room) || 'the consulting room', triagePriority: a.priority || 'Normal OPD', queuePosition: queueAhead(queue, saved) + 1
      });
    }
    res.json(saved);
  });

  return router;
}
