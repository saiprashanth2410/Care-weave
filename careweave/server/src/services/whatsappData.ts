import type { Repos } from '../repo/index.js';
import { exactCI } from '../repo/base.js';
import { isoToday } from '../util.js';
import { replyTo } from '../whatsapp/messages.js';
import { unregisteredReply } from './whatsappRegister.js';

const digitsOf = (v: any) => String(v ?? '').replace(/\D/g, '');

/**
 * The records the WhatsApp replies read, limited to what one sender can ask about: the patients matching the phone or UHID,
 * their appointments, lab orders and prescriptions, plus every appointment of today (the queue and the next token are counted over the day).
 * The reply functions were written against a whole-database object, so this returns one with just those collections filled in.
 */
export async function whatsappView(repos: Repos, q: { phone?: string; uhid?: string }) {
  const uhid = String(q.uhid || '').trim();
  const tail = digitsOf(q.phone).slice(-10);
  const [byUhid, byPhone] = await Promise.all([
    uhid ? repos.patients.find({ $or: [{ patientId: exactCI(uhid) }, { id: uhid }] }) : [],
    digitsOf(q.phone).length >= 7 ? repos.patients.byPhone(tail) : [],
  ]);
  const patients = [...new Map([...byUhid, ...byPhone].map((p: any) => [p.id, p])).values()];
  const ids = patients.map((p: any) => p.id);
  const refs = patients.flatMap((p: any) => [p.id, p.patientId]);
  const [today, theirs, labOrders, prescriptions, doctors] = await Promise.all([
    repos.appointments.onDay(isoToday()),
    repos.appointments.find({ patientId: { $in: ids } }),
    repos.orders.find({ $or: [{ registeredPatientRef: { $in: refs } }, { patientId: { $in: refs } }] }),
    repos.prescriptions.find({ patientId: { $in: ids } }),
    repos.users.byRole('doctor'),
  ]);
  const appointments = [...new Map([...today, ...theirs].map((a: any) => [a.id, a])).values()];
  const rooms = Object.fromEntries(doctors.filter((d: any) => d.room).map((d: any) => [d.id, d.room]));
  return { patients, appointments, labOrders, prescriptions, rooms };
}

/** The UHID a reply will look for: the second word of the message, as `replyTo` reads it. */
export const uhidFromBody = (body: string) => String(body || '').trim().split(/\s+/)[1] || '';

/** One WhatsApp message in, one reply out, with the sender's saved language applied and a language change saved. */
export async function replyFor(repos: Repos, phone: string, body: string) {
  const key = digitsOf(phone).slice(-10);
  // A number no patient owns can only register (or switch language); QUEUE, REPORT and MEDS stay locked until it has.
  const word = String(body || '').trim().split(/\s+/)[0]?.toUpperCase() || '';
  if (key.length === 10 && word !== 'LANG' && word !== 'LANGUAGE' && !(await repos.patients.byPhone(key)).length) {
    return unregisteredReply(repos, phone, key, body, await repos.whatsappPrefs.languageOf(key));
  }
  const [view, language] = await Promise.all([
    whatsappView(repos, { phone, uhid: uhidFromBody(body) }),
    key ? repos.whatsappPrefs.languageOf(key) : 'en' as const,
  ]);
  const out = replyTo({ ...view, language }, phone, body);
  if (out.resetLanguage && key) await repos.whatsappPrefs.clearLanguage(key);
  else if (out.language && key) await repos.whatsappPrefs.setLanguage(key, out.language);
  return out;
}
