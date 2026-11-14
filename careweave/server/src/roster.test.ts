import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';

const today = new Date().toISOString().slice(0, 10);
const person = (n: number) => ({ name: `Roster Patient ${n}`, dob: '1990-01-01', gender: 'Female', phone: `+91 9000${n}0000`, address: 'Chennai' });

async function setup() {
  const srv = await startInstance(await memoryStore());
  const reception = await srv.login('reception');
  const doctor = await srv.login('doctor');
  const admin = await srv.login('admin');
  const doctorId = (await srv.call('GET', '/api/me', { token: doctor })).json.id as string; // the doctor who is signed in
  /** Book a patient with the doctor at a time and move them to a status. */
  const book = async (n: number, time: string, status?: string, doctorToken = doctor) => {
    const p = (await srv.call('POST', '/api/patients', { token: reception, body: person(n) })).json;
    const a = await srv.call('POST', '/api/appointments', { token: reception, body: { patientId: p.id, doctorId, date: today, time, reason: 'Visit' } });
    assert.equal(a.status, 201, JSON.stringify(a.json));
    let row = a.json;
    for (const s of status ? (status === 'Completed' ? ['Checked In', 'In Consultation', 'Completed'] : status === 'In Consultation' ? ['Checked In', 'In Consultation'] : [status]) : []) {
      const r = await srv.call('PATCH', `/api/appointments/${row.id}`, { token: s === 'Checked In' ? reception : doctorToken, body: { status: s, version: row.version } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      row = r.json;
    }
    return row;
  };
  return { srv, reception, doctor, admin, doctorId, book };
}

test('roster: real doctors only, with who is in consultation, who waits and who was seen', async () => {
  const { srv, reception, doctorId, book } = await setup();
  try {
    await book(1, '09:00 AM', 'Completed');
    await book(2, '09:30 AM', 'Completed');
    await book(3, '10:00 AM', 'In Consultation');
    await book(4, '10:30 AM', 'Checked In');
    await book(5, '11:00 AM');
    const roster = (await srv.call('GET', `/api/doctors/roster?today=${today}&now=09:00`, { token: reception })).json;
    const listed = (await srv.call('GET', '/api/doctors', { token: reception })).json.map((x: any) => x.id).sort();
    assert.deepEqual(roster.map((x: any) => x.id).sort(), listed); // exactly the real, active doctors: none invented
    const d = roster.find((x: any) => x.id === doctorId);
    assert.equal(d.status, 'in_consultation');
    assert.equal(d.current.patientName, 'Roster Patient 3');
    assert.equal(d.waiting, 1);
    assert.equal(d.scheduled, 1);
    assert.equal(d.seen, 2);
    // 09:00, 09:30 are Completed (no longer holding the slot) so they count as free again; 10:00 to 11:00 are held.
    assert.equal(d.nextOpenSlot, '09:00 AM');
  } finally { await srv.close(); }
});

test('roster: a doctor an administrator adds appears at once, with their room and hours; a disabled one disappears', async () => {
  const { srv, reception, admin } = await setup();
  try {
    const made = await srv.call('POST', '/api/staff', { token: admin, body: { name: 'Dr. Newly Added', email: 'newdoc@careweave.test', role: 'doctor', facility: 'Cardiology', room: 'Room 9', shiftStart: '10:00', shiftEnd: '12:00' } });
    assert.equal(made.status, 201, JSON.stringify(made.json));
    const list = (await srv.call('GET', '/api/doctors', { token: reception })).json;
    const added = list.find((d: any) => d.name === 'Dr. Newly Added');
    assert.ok(added, 'the new doctor is bookable');
    assert.equal(added.room, 'Room 9');
    const roster = (await srv.call('GET', `/api/doctors/roster?today=${today}`, { token: reception })).json;
    assert.ok(roster.some((d: any) => d.id === added.id));
    await srv.call('PATCH', `/api/staff/${added.id}`, { token: admin, body: { active: false } });
    assert.ok(!(await srv.call('GET', `/api/doctors/roster?today=${today}`, { token: reception })).json.some((d: any) => d.id === added.id));
    assert.ok(!(await srv.call('GET', '/api/doctors', { token: reception })).json.some((d: any) => d.id === added.id));
  } finally { await srv.close(); }
});

test('slots: booked and passed times cannot be picked, a doctor\'s own working hours limit the list', async () => {
  const { srv, reception, admin, doctorId, book } = await setup();
  try {
    await book(1, '10:00 AM');
    const s = (await srv.call('GET', `/api/doctors/${doctorId}/slots?date=${today}&today=${today}&now=09:20`, { token: reception })).json;
    const state = (t: string) => s.slots.find((x: any) => x.time === t)?.state;
    assert.equal(state('08:30 AM'), 'past');
    assert.equal(state('09:00 AM'), 'past');
    assert.equal(state('09:30 AM'), 'free');
    assert.equal(state('10:00 AM'), 'booked');
    assert.equal(s.nextFree, '09:30 AM');
    // Another day: nothing is past, and only the booked time is taken
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const t = (await srv.call('GET', `/api/doctors/${doctorId}/slots?date=${tomorrow}&today=${today}&now=09:20`, { token: reception })).json;
    assert.equal(t.slots.find((x: any) => x.time === '08:30 AM').state, 'free');
    assert.ok(t.slots.every((x: any) => x.state === 'free'));

    // Working hours 10:00 to 11:00 leave only those slots
    await srv.call('PATCH', `/api/staff/${doctorId}`, { token: admin, body: { shiftStart: '10:00', shiftEnd: '11:00' } });
    const h = (await srv.call('GET', `/api/doctors/${doctorId}/slots?date=${tomorrow}`, { token: reception })).json;
    assert.deepEqual(h.slots.map((x: any) => x.time), ['10:00 AM', '10:30 AM', '11:00 AM']);
  } finally { await srv.close(); }
});

test('doctor day: names who was seen, who is in the room, who waits and who is coming', async () => {
  const { srv, reception, doctorId, book } = await setup();
  try {
    await book(1, '09:00 AM', 'Completed');
    await book(2, '09:30 AM', 'In Consultation');
    await book(3, '10:00 AM', 'Checked In');
    await book(4, '10:30 AM');
    const day = (await srv.call('GET', `/api/doctors/${doctorId}/day?date=${today}&today=${today}`, { token: reception })).json;
    assert.deepEqual(day.seen.map((a: any) => a.patientName), ['Roster Patient 1']);
    assert.deepEqual(day.current.map((a: any) => a.patientName), ['Roster Patient 2']);
    assert.deepEqual(day.waiting.map((a: any) => a.patientName), ['Roster Patient 3']);
    assert.deepEqual(day.upcoming.map((a: any) => a.patientName), ['Roster Patient 4']);
    assert.ok(day.seen[0].completedAt && day.seen[0].startedAt);
    assert.equal((await srv.call('GET', '/api/doctors/nope/day', { token: reception })).status, 404);
    // Only the clinical-free fields leave the server
    assert.ok(!JSON.stringify(day).includes('diagnosis'));
  } finally { await srv.close(); }
});

test('roster and day are for the front desk; room and hours are validated', async () => {
  const { srv, doctor, admin, doctorId } = await setup();
  try {
    assert.equal((await srv.call('GET', '/api/doctors/roster', { token: doctor })).status, 403);
    assert.equal((await srv.call('GET', `/api/doctors/${doctorId}/day`, { token: doctor })).status, 403);
    for (const body of [{ shiftStart: '9am' }, { shiftStart: '17:00', shiftEnd: '09:00' }, { shiftEnd: '08:00' }]) {
      assert.equal((await srv.call('PATCH', `/api/staff/${doctorId}`, { token: admin, body })).status, 400, JSON.stringify(body));
    }
    const ok = await srv.call('PATCH', `/api/staff/${doctorId}`, { token: admin, body: { room: 'Room 4', shiftStart: '09:00', shiftEnd: '13:00' } });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.json.room, ok.json.shiftStart, ok.json.shiftEnd], ['Room 4', '09:00', '13:00']);
  } finally { await srv.close(); }
});
