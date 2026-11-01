import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitEvent, recentEvents } from './whatsapp/emitter.js';
import { activePrescriptions, nextToken, queueStatus, replyTo, scheduleOf } from './whatsapp/messages.js';

const today = new Date().toISOString().slice(0, 10);
const db: any = {
  patients: [{ id: 'p1', patientId: 'CW-1', name: 'Asha Rao', phone: '+91 98765 43210' }],
  appointments: [
    { id: 'a0', patientId: 'p9', doctorId: 'd1', date: today, status: 'Checked In', checkedInAt: '2026-01-01T09:00:00Z', token: 'A-001' },
    { id: 'a1', patientId: 'p1', patientName: 'Asha Rao', doctorId: 'd1', doctorName: 'Dr. ANIRBAN LAHA', date: today, status: 'Checked In', checkedInAt: '2026-01-01T09:05:00Z', token: 'A-002' }
  ],
  labOrders: [],
  prescriptions: [
    { patientId: 'p1', status: 'Active', medicine: 'Metformin 500 mg', dosage: '1 tablet', frequency: 'Twice daily with meals', duration: '90 days', date: new Date().toISOString() },
    { patientId: 'p1', status: 'Active', medicine: 'Atorvastatin', dosage: '10 mg', frequency: 'At bedtime', date: new Date().toISOString() },
    { patientId: 'p1', status: 'Stopped', medicine: 'Old drug', dosage: '1', frequency: 'Once daily', date: new Date().toISOString() }
  ]
};

test('reads dosing frequencies, and does not guess unknown ones', () => {
  assert.deepEqual(scheduleOf('1-0-1'), ['morning', 'night']);
  assert.deepEqual(scheduleOf('Three times daily'), ['morning', 'afternoon', 'night']);
  assert.deepEqual(scheduleOf('At bedtime'), ['night']);
  assert.equal(scheduleOf('as needed for pain'), null);
});

test('queue status counts patients ahead and finds the patient by any phone format', () => {
  const r: any = queueStatus(db, { phone: '9876543210' });
  assert.equal(r.token, 'A-002');
  assert.equal(r.aheadCount, 1);
  assert.equal(r.room, 'Room 4');
  assert.equal(queueStatus(db, { phone: '0000000000' }).found, false);
});

test('next token follows the tokens already issued today', () => {
  assert.equal(nextToken(db, today), 'A-003');
});

test('medicines split into morning and night, and stopped ones are left out', () => {
  const r: any = activePrescriptions(db, { phone: '+919876543210', uhid: 'CW-1' });
  assert.equal(r.medications.length, 2);
  assert.equal(r.medications[0].schedule.morning, '1 tablet');
  assert.equal(r.medications[0].schedule.afternoon, null);
  assert.equal(r.medications[0].food, 'With food');
});

test('keywords route to the right answer, anything else gets help', () => {
  assert.equal(replyTo(db, '9876543210', 'queue A-002').command, 'QUEUE');
  assert.equal(replyTo(db, '9876543210', 'rx').command, 'MEDS');
  assert.match(replyTo(db, '9876543210', 'MEDS CW-1').reply, /Morning/);
  assert.equal(replyTo(db, '9876543210', 'hello').command, 'HELP');
});

test('an unreachable n8n never blocks or throws', async () => {
  process.env.N8N_WEBHOOK_URL = 'http://127.0.0.1:9/none';
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const t = Date.now();
  assert.doesNotThrow(() => emitEvent('PATIENT_CHECKED_IN', { name: 'X', phone: '1' }));
  assert.ok(Date.now() - t < 500, 'emit returns immediately (it must not wait for the 3 s webhook limit)');
  process.env.NODE_ENV = prev;
  assert.ok(recentEvents().some((e) => e.event === 'PATIENT_CHECKED_IN'));
  await new Promise((r) => setTimeout(r, 200));
});

test('reports and medicines need the UHID as well as the phone, and both must match the same patient', () => {
  assert.match(replyTo(db, '9876543210', 'MEDS').reply, /add your UHID/);
  assert.match(replyTo(db, '9876543210', 'REPORT').reply, /add your UHID/);
  assert.match(replyTo(db, '9876543210', 'MEDS CW-999').reply, /could not find/);
  assert.match(replyTo(db, '9000000000', 'MEDS CW-1').reply, /could not find/);
  assert.match(replyTo(db, '9876543210', 'meds cw-1').reply, /Morning/);
  assert.equal((activePrescriptions(db, { uhid: 'CW-1' }) as any).verificationRequired, true);
});
