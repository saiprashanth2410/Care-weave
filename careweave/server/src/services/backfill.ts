import type { Repos } from '../repo/index.js';
import { DuplicateError } from '../repo/store.js';
import { patientKeyOf, slotKeyOf, tokenKeyOf, ACTIVE } from '../repo/appointments.js';

/**
 * Appointments created before the unique keys existed carry none, so the double-booking guards did not cover them. This gives every
 * active booking the keys it should have. It is safe to run on every start: a booking that already has its keys is skipped, and one
 * that would clash with another (a double booking that already exists) is left as it is and reported, not changed.
 */
export async function backfillAppointmentKeys(repos: Repos) {
  const active = await repos.appointments.find(ACTIVE);
  let updated = 0;
  const clashes: string[] = [];
  for (const a of active) {
    const want = { slotKey: slotKeyOf(a), patientKey: patientKeyOf(a), tokenKey: tokenKeyOf(a) };
    const changes = Object.fromEntries(Object.entries(want).filter(([k, v]) => v !== undefined && a[k] !== v));
    if (!Object.keys(changes).length) continue;
    try {
      await repos.appointments.update(a, changes);
      updated++;
    } catch (err) {
      if (err instanceof DuplicateError) clashes.push(`${a.id} (${err.field})`);
      else if ((err as Error).name !== 'ConflictError') throw err; // changed by someone else meanwhile; the next start picks it up
    }
  }
  if (updated) console.log(`[migrate] gave ${updated} existing appointment(s) their booking keys`);
  if (clashes.length) console.warn(`[migrate] ${clashes.length} appointment(s) clash with another booking and were left unchanged: ${clashes.join(', ')}`);
  return { updated, clashes };
}
