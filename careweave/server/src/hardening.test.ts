import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuplicateError, createRepos } from './repo/index.js';
import { memoryStore, startInstance } from './testing.js';

const person = { name: 'Test Person', dob: '1990-01-01', gender: 'Female', phone: '+91 90000 00000', address: 'Chennai' };

test('OP tokens: concurrent check-ins on two instances never share a token', async () => {
  const store = await memoryStore();
  const a = await startInstance(store);
  const b = await startInstance(store);
  try {
    const rec = await a.login();
    const doc = (await a.call('GET', '/api/doctors', { token: rec })).json[0];
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const p = (await a.call('POST', '/api/patients', { token: rec, body: { ...person, name: `P${i}`, phone: `+91 9100${i}` } })).json;
      const appt = await a.call('POST', '/api/appointments', { token: rec, body: { patientId: p.id, doctorId: doc.id, date: 'Today', time: `1${i}:00`, reason: 'Visit' } });
      assert.equal(appt.status, 201, JSON.stringify(appt.json));
      ids.push(appt.json.id);
    }
    const recB = await b.login();
    const out = await Promise.all(ids.map((id, i) =>
      (i % 2 ? a : b).call('PATCH', `/api/appointments/${id}`, { token: i % 2 ? rec : recB, body: { status: 'Checked In' } })));
    assert.deepEqual(out.map((r) => r.status), ids.map(() => 200), JSON.stringify(out.map((r) => r.json)));
    const tokens = out.map((r) => r.json.token);
    assert.equal(new Set(tokens).size, tokens.length, `duplicate in ${tokens}`);
  } finally {
    await a.close(); await b.close();
  }
});

test('the unique keys report which guard fired: a token, or the patient being booked twice', async () => {
  const repos = createRepos(await memoryStore());
  await repos.appointments.insert({ id: 'x1', patientId: 'p', patientKey: 'p|2030-01-01|09:00', tokenKey: '2030-01-01|A-001', status: 'Checked In' });
  await assert.rejects(repos.appointments.insert({ id: 'x2', patientId: 'p', patientKey: 'p|2030-01-01|09:00', status: 'Scheduled' }), (e: any) => e instanceof DuplicateError && e.field === 'patientKey');
  await assert.rejects(repos.appointments.insert({ id: 'x3', tokenKey: '2030-01-01|A-001', status: 'Checked In' }), (e: any) => e instanceof DuplicateError && e.field === 'tokenKey');
});

test('a patient cannot be booked twice at one time, with two different doctors, and can rebook after a cancel', async () => {
  const s = await startInstance(await memoryStore());
  try {
    const rec = await s.login();
    const docs = (await s.call('GET', '/api/doctors', { token: rec })).json;
    const p = (await s.call('POST', '/api/patients', { token: rec, body: person })).json;
    const book = (doctorId: string) => s.call('POST', '/api/appointments', { token: rec, body: { patientId: p.id, doctorId, date: '2030-03-03', time: '10:00', reason: 'Visit' } });
    const first = await book(docs[0].id);
    assert.equal(first.status, 201);
    const second = await book((docs[1] ?? docs[0]).id);
    assert.equal(second.status, 409);
    assert.match(second.json.error, /already has an appointment/);
    await s.call('PATCH', `/api/appointments/${first.json.id}`, { token: rec, body: { status: 'Cancelled' } });
    assert.equal((await book(docs[0].id)).status, 201);
  } finally {
    await s.close();
  }
});

test('WhatsApp language choice is stored in the database: another instance, and a restart, keep it', async () => {
  const store = await memoryStore();
  const a = await startInstance(store);
  const rec = await a.login();
  const say = (s: typeof a, token: string, message: string) => s.call('POST', '/api/whatsapp/simulate', { token, body: { phone: '+91 98765 43210', message } });
  try {
    const english = (await say(a, rec, 'hello')).json.reply;
    assert.equal((await say(a, rec, 'LANG TA')).json.command, 'LANG');
    const b = await startInstance(store);
    try {
      const tamil = (await say(b, await b.login(), 'hello')).json.reply;
      assert.notEqual(tamil, english);
      assert.match(tamil, /[஀-௿]/);
      await say(b, await b.login(), 'LANG EN');
      assert.equal((await say(a, rec, 'hello')).json.reply, english);
    } finally {
      await b.close();
    }
  } finally {
    await a.close();
  }
});

test('the rate limiter fails closed: if its counters cannot be reached the request gets 503, not a free pass', async () => {
  const store = await memoryStore();
  store.collection('rateLimits').hit = async () => { throw new Error('database down'); };
  const s = await startInstance(store);
  try {
    const res = await s.call('POST', '/api/auth/login', { body: { email: 'doctor@careweave.test', password: 'demo123' } });
    assert.equal(res.status, 503);
  } finally {
    await s.close();
  }
});

test('every response carries a Content-Security-Policy, also when running on Vercel', async () => {
  const was = process.env.VERCEL;
  process.env.VERCEL = '1';
  const s = await startInstance(await memoryStore());
  try {
    const res = await s.call('GET', '/api/health');
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  } finally {
    await s.close();
    if (was === undefined) delete process.env.VERCEL; else process.env.VERCEL = was;
  }
});
