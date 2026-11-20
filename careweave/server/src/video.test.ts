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

test('video: chat and captions are kept, validated, and shown to the doctor as one transcript', async () => {
  const { srv, doctor, patient, start } = await setup();
  try {
    const c = (await start(patient.id)).json;
    const post = (body: object) => srv.call('POST', `/api/video/public/${c.id}/signal`, { body });
    assert.equal((await post({ role: 'patient', type: 'chat', data: { text: '   ' } })).status, 400);
    assert.equal((await post({ role: 'patient', type: 'chat', data: { text: 'x'.repeat(1001) } })).status, 413);
    assert.equal((await post({ role: 'patient', type: 'chat', data: { text: 'I have fever since 2 days' } })).status, 201);
    assert.equal((await post({ role: 'doctor', key: c.doctorKey, type: 'caption', data: { text: 'Take paracetamol 500 after food' } })).status, 201);
    const t = await srv.call('GET', `/api/video/consults/${c.id}/transcript`, { token: doctor });
    assert.deepEqual(t.json.lines.map((l: any) => `${l.from}/${l.kind}: ${l.text}`), ['patient/chat: I have fever since 2 days', 'doctor/caption: Take paracetamol 500 after food']);
    assert.equal((await srv.call('GET', `/api/video/consults/${c.id}/transcript`, { token: await srv.login('lab') })).status, 403);
  } finally { await srv.close(); }
});

test('video: the summary needs something to summarise, falls back to the transcript with no AI key, and never sends names to the AI', async () => {
  const { forgetAiConfig } = await import('./services/aiConfig.js');
  const realFetch = globalThis.fetch;
  const saved = process.env.GEMINI_API_KEY;
  const { srv, doctor, patient, start } = await setup();
  try {
    const c = (await start(patient.id)).json;
    const post = (body: object) => srv.call('POST', `/api/video/public/${c.id}/signal`, { body });
    const summary = () => srv.call('POST', `/api/video/consults/${c.id}/summary`, { token: doctor });

    assert.equal((await summary()).status, 400);
    await post({ role: 'patient', type: 'chat', data: { text: 'Fever and cough for two days' } });
    await post({ role: 'doctor', key: c.doctorKey, type: 'chat', data: { text: 'Take rest, drink water, paracetamol if above 100F' } });

    delete process.env.GEMINI_API_KEY; forgetAiConfig();
    const off = (await summary()).json;
    assert.equal(off.summary, null);
    assert.equal(off.reason, 'ai-off');
    assert.equal(off.lines.length, 2);

    process.env.GEMINI_API_KEY = ['AIza', 'SyFakeKeyForTheSummaryTest123456789'].join(''); forgetAiConfig();
    let sent = '';
    globalThis.fetch = (async (url: any, init: any) => {
      if (!String(url).includes('generativelanguage')) return realFetch(url, init);
      sent = String(init.body);
      return new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ text: 'Reason for consultation: fever and cough.' }] }] }), { status: 200 });
    }) as typeof fetch;
    const ok = (await summary()).json;
    assert.match(ok.summary, /fever and cough/);
    assert.match(sent, /Patient: Fever and cough for two days/);
    assert.match(sent, /Doctor: Take rest/);
    assert.ok(!sent.includes('Video Patient'), 'the patient name must not reach the AI');
    assert.ok(!sent.includes('ANIRBAN'), 'the doctor name must not reach the AI');
  } finally {
    globalThis.fetch = realFetch;
    if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved;
    forgetAiConfig();
    await srv.close();
  }
});

test('video: the front desk roster shows the doctor as "in a video consultation" while the call is live, and not after it ends or goes silent', async () => {
  const store = await memoryStore();
  const srv = await startInstance(store);
  try {
    const reception = await srv.login('reception'), doctor = await srv.login('doctor');
    const me = (await srv.call('GET', '/api/me', { token: doctor })).json;
    const patient = (await srv.call('POST', '/api/patients', { token: reception, body: { name: 'Roster Patient', dob: '1980-08-08', gender: 'F', phone: '+91 90000 77777' } })).json;
    await srv.call('POST', '/api/appointments', { token: reception, body: { patientId: patient.id, doctorId: me.id, date: new Date().toISOString().slice(0, 10), time: '04:00 PM', reason: 'Video' } });
    const roster = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const rows = (await srv.call('GET', `/api/doctors/roster?today=${today}&now=12:00`, { token: reception })).json as any[];
      return rows.find((d) => d.id === me.id);
    };
    assert.notEqual((await roster()).status, 'in_video');

    const c = (await srv.call('POST', '/api/video/consults', { token: doctor, body: { patientId: patient.id } })).json;
    const during = await roster();
    assert.equal(during.status, 'in_video');
    assert.equal(during.video.patientName, 'Roster Patient');

    // The doctor closes the tab without pressing End: after 45 s of silence the badge goes away.
    const repos = createRepos(store);
    await repos.videoConsults.update(await repos.videoConsults.byToken(c.id), { doctorSeenAt: new Date(Date.now() - 60_000).toISOString() });
    assert.notEqual((await roster()).status, 'in_video');
    // Polling again is the heartbeat that brings it back.
    await srv.call('GET', `/api/video/public/${c.id}/signals?role=doctor&key=${c.doctorKey}&since=0`);
    assert.equal((await roster()).status, 'in_video');

    await srv.call('POST', `/api/video/consults/${c.id}/end`, { token: doctor });
    const after = await roster();
    assert.notEqual(after.status, 'in_video');
    assert.equal(after.video, null);
    // Receptionists cannot see anyone else's call details beyond the patient name: no link or key in the roster.
    assert.ok(!JSON.stringify(during).includes(c.id) && !JSON.stringify(during).includes(c.doctorKey));
  } finally { await srv.close(); }
});

test('video: a doctor can start a call with a walk-in who has no record, using only a name and phone, and cannot be tricked into a chart', async () => {
  const { srv, reception, doctor } = await setup();
  try {
    const start = (body: object, token = doctor) => srv.call('POST', '/api/video/consults', { token, body });
    assert.equal((await start({ name: 'Walk In Person', phone: '+91 98765 11111' }, reception)).status, 403, 'only doctors');
    assert.equal((await start({ name: 'X' })).status, 400);
    assert.equal((await start({ name: '12345', phone: '9876511111' })).status, 400);
    assert.equal((await start({ name: 'Walk In Person', phone: '123' })).status, 400);

    const ok = await start({ name: 'Walk In Person', phone: '+91 98765 11111' });
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.json.walkIn, true);
    assert.equal(ok.json.hasPhone, true);
    const info = (await srv.call('GET', `/api/video/public/${ok.json.id}`)).json;
    assert.equal(info.patientFirstName, 'Walk');

    // WhatsApp is switched off in tests: the send must reach the phone step (502 from the sender), not fail for lack of a record.
    const send = await srv.call('POST', `/api/video/consults/${ok.json.id}/send`, { token: doctor });
    assert.equal(send.status, 502);
    assert.match(send.json.link, new RegExp(`/consult/${ok.json.id}$`));

    // No phone is fine too: the doctor shares the link themselves.
    const noPhone = await start({ name: 'Another Person' });
    assert.equal(noPhone.status, 201);
    assert.equal(noPhone.json.hasPhone, false);
    assert.equal((await srv.call('POST', `/api/video/consults/${noPhone.json.id}/send`, { token: doctor })).status, 400);

    // The walk-in path never opens a chart: a patient id that is not theirs still needs the link check.
    assert.equal((await start({ patientId: 'someone-else' })).status, 404);
    const audit = (await srv.call('GET', '/api/audit?entity=videoConsult&limit=50', { token: await srv.login('admin') })).json;
    assert.ok(JSON.stringify(audit).includes('walk-in'), 'the walk-in call is audited');
  } finally { await srv.close(); }
});
