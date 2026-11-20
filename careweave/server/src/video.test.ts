import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';
import { createRepos } from './repo/index.js';

async function setup() {
  const srv = await startInstance(await memoryStore());
  const reception = await srv.login('reception');
  const doctor = await srv.login('doctor');
  const me = (await srv.call('GET', '/api/me', { token: doctor })).json;
  const patient = (await srv.call('POST', '/api/patients', { token: reception, body: { name: 'Video Patient', dob: '1985-05-05', gender: 'F', phone: '+91 90000 22222' } })).json;
  const other = (await srv.call('POST', '/api/patients', { token: reception, body: { name: 'Unlinked Person', dob: '1970-01-01', gender: 'M', phone: '+91 90000 33333' } })).json;
  const appt = await srv.call('POST', '/api/appointments', { token: reception, body: { patientId: patient.id, doctorId: me.id, date: new Date().toISOString().slice(0, 10), time: '10:30 AM', reason: 'Video follow-up' } });
  assert.equal(appt.status, 201, appt.text);
  const start = (patientId: string, token = doctor) => srv.call('POST', '/api/video/consults', { token, body: { patientId } });
  return { srv, reception, doctor, patient, other, start };
}

test('video: only a doctor linked to the patient can start a consult', async () => {
  const { srv, reception, patient, other, start } = await setup();
  try {
    assert.equal((await srv.call('POST', '/api/video/consults', { body: { patientId: patient.id } })).status, 401);
    assert.equal((await start(patient.id, reception)).status, 403);
    assert.equal((await start(other.id)).status, 403);
    assert.equal((await start('nobody')).status, 404);
    const ok = await start(patient.id);
    assert.equal(ok.status, 201, ok.text);
    assert.ok(ok.json.id.length >= 20 && ok.json.doctorKey.length >= 20);
    assert.equal(ok.json.hasPhone, true);
  } finally { await srv.close(); }
});

test('video: the patient link shows only the doctor name and the patient first name, and unknown links are refused', async () => {
  const { srv, patient, start } = await setup();
  try {
    const c = (await start(patient.id)).json;
    const info = await srv.call('GET', `/api/video/public/${c.id}`);
    assert.equal(info.status, 200);
    assert.deepEqual(Object.keys(info.json).sort(), ['doctorName', 'expiresAt', 'patientFirstName']);
    assert.equal(info.json.patientFirstName, 'Video');
    assert.equal((await srv.call('GET', '/api/video/public/not-a-real-token')).status, 404);
  } finally { await srv.close(); }
});

test('video: doctor and patient exchange signals; the doctor side needs its key and each side reads only the other side', async () => {
  const { srv, patient, start } = await setup();
  try {
    const c = (await start(patient.id)).json;
    const base = `/api/video/public/${c.id}`;
    const post = (body: object) => srv.call('POST', `${base}/signal`, { body });

    assert.equal((await post({ role: 'patient', type: 'ready', data: { at: 1 } })).status, 201);
    assert.equal((await post({ role: 'doctor', type: 'offer', data: { sdp: 'x' } })).status, 403, 'doctor without key');
    assert.equal((await post({ role: 'doctor', key: 'wrong', type: 'offer', data: {} })).status, 403);
    assert.equal((await post({ role: 'doctor', key: c.doctorKey, type: 'offer', data: { sdp: 'offer-sdp' } })).status, 201);
    assert.equal((await post({ role: 'patient', type: 'hack', data: {} })).status, 400);
    assert.equal((await post({ role: 'patient', type: 'ice', data: 'x'.repeat(30_000) })).status, 413);

    const forDoctor = await srv.call('GET', `${base}/signals?role=doctor&key=${c.doctorKey}&since=0`);
    assert.deepEqual(forDoctor.json.signals.map((s: any) => s.type), ['ready']);
    const forPatient = await srv.call('GET', `${base}/signals?role=patient&since=0`);
    assert.deepEqual(forPatient.json.signals.map((s: any) => s.type), ['offer']);
    assert.deepEqual(forPatient.json.signals[0].data, { sdp: 'offer-sdp' });
    assert.equal((await srv.call('GET', `${base}/signals?role=doctor&since=0`)).status, 403);
    // `since` skips what was already read
    const again = await srv.call('GET', `${base}/signals?role=patient&since=${forPatient.json.signals[0].at}`);
    assert.equal(again.json.signals.length, 0);
  } finally { await srv.close(); }
});

test('video: ending a consult closes the link, and another doctor cannot end or send it', async () => {
  const { srv, patient, start } = await setup();
  try {
    const c = (await start(patient.id)).json;
    const lab = await srv.login('lab');
    assert.equal((await srv.call('POST', `/api/video/consults/${c.id}/end`, { token: lab })).status, 403);
    const doctor = await srv.login('doctor');
    // WhatsApp is switched off in tests, so the send is reported as not sent rather than pretending.
    const send = await srv.call('POST', `/api/video/consults/${c.id}/send`, { token: doctor });
    assert.equal(send.status, 502);
    assert.equal(send.json.sent, false);
    assert.match(send.json.link, new RegExp(`/consult/${c.id}$`));
    assert.equal((await srv.call('POST', `/api/video/consults/${c.id}/end`, { token: doctor })).status, 200);
    assert.equal((await srv.call('GET', `/api/video/public/${c.id}`)).status, 410);
    assert.equal((await srv.call('POST', `/api/video/public/${c.id}/signal`, { body: { role: 'patient', type: 'ready' } })).status, 410);
  } finally { await srv.close(); }
});

test('video: an expired link is refused', async () => {
  const store = await memoryStore();
  const srv = await startInstance(store);
  try {
    const reception = await srv.login('reception'), doctor = await srv.login('doctor');
    const me = (await srv.call('GET', '/api/me', { token: doctor })).json;
    const patient = (await srv.call('POST', '/api/patients', { token: reception, body: { name: 'Late Patient', dob: '1990-02-02', gender: 'M', phone: '+91 90000 44444' } })).json;
    await srv.call('POST', '/api/appointments', { token: reception, body: { patientId: patient.id, doctorId: me.id, date: new Date().toISOString().slice(0, 10), time: '11:00 AM', reason: 'Visit' } });
    const c = (await srv.call('POST', '/api/video/consults', { token: doctor, body: { patientId: patient.id } })).json;
    assert.equal((await srv.call('GET', `/api/video/public/${c.id}`)).status, 200);
    const repos = createRepos(store);
    const row = await repos.videoConsults.byToken(c.id);
    await repos.videoConsults.update(row, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    const gone = await srv.call('GET', `/api/video/public/${c.id}`);
    assert.equal(gone.status, 410);
    assert.match(gone.json.error, /expired/i);
  } finally { await srv.close(); }
});
