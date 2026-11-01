import { baseRepo, idIndex } from './base.js';
import type { Collection, Filter, IndexSpec } from './store.js';

export const appointmentsIndexes: IndexSpec[] = [
  idIndex,
  { keys: { doctorId: 1, date: 1, time: 1 } },
  { keys: { patientId: 1 } },
  { keys: { date: 1, status: 1 } },
  // One active booking per doctor per slot. The key exists only while the booking is active, so a cancelled slot can be booked again.
  { keys: { slotKey: 1 }, unique: true, partial: { slotKey: { $type: 'string' } } },
  // One active booking per patient per time, and one OP token per day. Same idea: the key exists only while it applies.
  { keys: { patientKey: 1 }, unique: true, partial: { patientKey: { $type: 'string' } } },
  { keys: { tokenKey: 1 }, unique: true, partial: { tokenKey: { $type: 'string' } } },
];

/** The slot a booking holds: set while it is active, absent once cancelled, completed or a no-show (or when no doctor is assigned). */
export const slotKeyOf = (a: { doctorId?: string; date: string; time: string; status: string }) =>
  a.doctorId && !['Cancelled', 'Completed', 'No Show'].includes(a.status) ? `${a.doctorId}|${a.date}|${a.time}` : undefined;

const INACTIVE = ['Cancelled', 'Completed', 'No Show'];
/** The patient's own booking at this time; absent once the booking is no longer active. */
export const patientKeyOf = (a: { patientId?: string; date: string; time: string; status: string }) =>
  a.patientId && !INACTIVE.includes(a.status) ? `${a.patientId}|${a.date}|${a.time}` : undefined;
/** The OP token for a day, however the date was written ('Today' and today's ISO date are the same day). */
export const tokenKeyOf = (a: { token?: string; date: string }) =>
  a.token ? `${a.date === 'Today' ? new Date().toISOString().slice(0, 10) : a.date.slice(0, 10)}|${a.token}` : undefined;

export const ACTIVE: Filter = { status: { $nin: ['Cancelled', 'Completed', 'No Show'] } };

export const appointmentsRepo = (c: Collection) => ({
  ...baseRepo(c),
  forDoctor: (doctorId: string) => c.find({ doctorId }),
  forPatient: (patientId: string) => c.find({ patientId }),
  /** The active booking, if any, for this patient at this time. */
  patientSlot: (patientId: string, date: string, time: string) => c.findOne({ patientId, date, time, ...ACTIVE }),
  /** The active booking, if any, for this doctor at this time (not counting `exceptId`). */
  doctorSlot: (doctorId: string, date: string, time: string, exceptId?: string) =>
    c.findOne({ doctorId, date, time, ...ACTIVE, ...(exceptId ? { id: { $ne: exceptId } } : {}) }),
  /** Every appointment on a day, whichever way the date was written ('Today' or an ISO timestamp). */
  onDay: (today: string) => c.find({ $or: [{ date: 'Today' }, { date: { $regex: `^${today}` } }] }),
});
