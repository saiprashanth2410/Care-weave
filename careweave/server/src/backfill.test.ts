import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepos } from './repo/index.js';
import { backfillAppointmentKeys } from './services/backfill.js';
import { nextToken } from './whatsapp/messages.js';
import { memoryStore } from './testing.js';

test('appointments created before the booking keys existed get them, and a second run changes nothing', async () => {
  const repos = createRepos(await memoryStore());
  const base = { patientId: 'p-1', doctorId: 'd-1', date: '2030-03-03', time: '10:00', status: 'Scheduled' };
  await repos.appointments.insert({ id: 'a-1', ...base });
  await repos.appointments.insert({ id: 'a-2', ...base, time: '11:00', status: 'Cancelled' });
  const first = await backfillAppointmentKeys(repos);
  assert.equal(first.updated, 1);
  const a1 = await repos.appointments.byId('a-1');
  assert.equal(a1.patientKey, 'p-1|2030-03-03|10:00');
  assert.equal(a1.slotKey, 'd-1|2030-03-03|10:00');
  assert.equal((await repos.appointments.byId('a-2')).patientKey, undefined, 'a cancelled booking holds no key');
  assert.equal((await backfillAppointmentKeys(repos)).updated, 0);
  // the guard now covers it
  await assert.rejects(repos.appointments.insert({ id: 'a-3', ...base, patientKey: 'p-1|2030-03-03|10:00' }));
});

test('an existing double booking is reported and left alone, not deleted', async () => {
  const repos = createRepos(await memoryStore());
  const base = { patientId: 'p-1', doctorId: 'd-1', date: '2030-03-03', time: '10:00', status: 'Scheduled' };
  await repos.appointments.insert({ id: 'a-1', ...base });
  await repos.appointments.insert({ id: 'a-2', ...base });
  const r = await backfillAppointmentKeys(repos);
  assert.equal(r.updated, 1);
  assert.equal(r.clashes.length, 1);
  assert.ok(await repos.appointments.byId('a-2'));
});

test('the next OP token follows the highest number issued, so a token that left the day is never issued twice', () => {
  const today = '2030-03-03';
  const db = { appointments: [{ token: 'A-001', date: today }, { token: 'A-003', date: today }, { token: 'A-009', date: '2030-03-04' }] };
  assert.equal(nextToken(db, today), 'A-004');
});
