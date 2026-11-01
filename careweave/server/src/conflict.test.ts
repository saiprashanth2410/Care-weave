import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ConflictError, DuplicateError, createRepos, openMongoStore, type Store } from './repo/index.js';
import { TEST_MONGODB_URI, memoryStore, startInstance } from './testing.js';

const CONFLICT = { error: 'Record was changed by someone else, reload and retry' };
const patient = { name: 'Asha Rao', dob: '1990-02-03', phone: '+91 98765 43210' };

// The same behaviour is checked on the in-memory store (always) and on MongoDB (when one is reachable).
async function mongoStore(): Promise<Store | null> {
  const uri = TEST_MONGODB_URI;
  const probe = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 1500 }).asPromise().catch(() => null);
  if (!probe) return null;
  await probe.close();
  return openMongoStore(uri, `careweave_unit_${process.pid}`, () => {});
}

function suite(name: string, open: () => Promise<Store>) {
  test(`${name}: a write with a stale version throws ConflictError and changes nothing`, async () => {
    const repos = createRepos(await open());
    const p = await repos.patients.insert({ id: 'p-1', patientId: 'CW-1', name: 'A', dob: '2000-01-01', phone: '1' });
    assert.equal(p.version, 1);
    const copyA = await repos.patients.byId('p-1');
    const copyB = await repos.patients.byId('p-1');
    const saved = await repos.patients.update(copyA, { phone: '2' });
    assert.equal(saved.version, 2);
    await assert.rejects(repos.patients.update(copyB, { phone: '3' }), ConflictError);
    const stored = await repos.patients.byId('p-1');
    assert.equal(stored.phone, '2');
    assert.equal(stored.version, 2);
  });

  test(`${name}: two writers racing from the same version: exactly one wins`, async () => {
    const repos = createRepos(await open());
    await repos.orders.insert({ id: 'ORD-1', status: 'requested', patientName: 'A' });
    const [a, b] = await Promise.all([repos.orders.byId('ORD-1'), repos.orders.byId('ORD-1')]);
    const results = await Promise.allSettled([repos.orders.update(a, { status: 'collected' }), repos.orders.update(b, { status: 'cancelled' })]);
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
    assert.equal((await repos.orders.byId('ORD-1')).version, 2);
  });

  test(`${name}: inserting an id twice is rejected, and a booked slot cannot be booked again`, async () => {
    const repos = createRepos(await open());
    await repos.appointments.insert({ id: 'a-1', doctorId: 'd', date: '2026-01-01', time: '10:00', status: 'Scheduled', slotKey: 'd|2026-01-01|10:00' });
    await assert.rejects(repos.appointments.insert({ id: 'a-1', status: 'Scheduled' }), DuplicateError);
    await assert.rejects(repos.appointments.insert({ id: 'a-2', doctorId: 'd', date: '2026-01-01', time: '10:00', status: 'Scheduled', slotKey: 'd|2026-01-01|10:00' }), DuplicateError);
  });

  test(`${name}: a field set to undefined is removed`, async () => {
    const repos = createRepos(await open());
    const p = await repos.patients.insert({ id: 'p-2', patientId: 'CW-2', name: 'B', dob: '2000-01-01', phone: '1', email: 'b@x.test' });
    const saved = await repos.patients.update(p, { email: undefined });
    assert.equal('email' in saved, false);
    assert.equal('email' in (await repos.patients.byId('p-2')), false);
  });
}

suite('memory store', memoryStore);

const mongo = await mongoStore();
if (mongo) {
  await mongo.close();
  let n = 0;
  suite('MongoDB', async () => {
    const store = await openMongoStore(TEST_MONGODB_URI, `careweave_unit_${process.pid}_${n++}`, () => {});
    await mongoose.connection.dropDatabase();
    const { INDEXES } = await import('./repo/index.js');
    await store.ensureIndexes(INDEXES);
    return store;
  });
  test.after(async () => { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); });
} else {
  test('MongoDB variants', { skip: 'no MongoDB reachable at CAREWEAVE_TEST_MONGODB_URI (default mongodb://127.0.0.1:27017)' }, () => {});
}

test('HTTP: an edit made from an old copy gets 409 with the reload message, and the newer edit survives', async () => {
  // Two server instances over one store: what two serverless instances over one database look like.
  const store = await memoryStore();
  const a = await startInstance(store);
  const b = await startInstance(store);
  try {
    const tokenA = await a.login();
    const tokenB = await b.login();
    const created = (await a.call('POST', '/api/patients', { token: tokenA, body: patient })).json;
    assert.equal(created.version, 1);

    const readByB = (await b.call('GET', `/api/patients?query=${created.patientId}`, { token: tokenB })).json[0];
    assert.equal(readByB.version, 1);

    const first = await a.call('PATCH', `/api/patients/${created.id}`, { token: tokenA, body: { phone: '+91 11111 11111', version: 1 } });
    assert.equal(first.status, 200);
    assert.equal(first.json.version, 2);

    const stale = await b.call('PATCH', `/api/patients/${created.id}`, { token: tokenB, body: { phone: '+91 22222 22222', version: readByB.version } });
    assert.equal(stale.status, 409);
    assert.deepEqual(stale.json, CONFLICT);

    const now = (await b.call('GET', `/api/patients?query=${created.patientId}`, { token: tokenB })).json[0];
    assert.equal(now.phone, '+91 11111 11111');
    assert.equal(now.version, 2);

    // After reloading, the retry succeeds.
    const retry = await b.call('PATCH', `/api/patients/${created.id}`, { token: tokenB, body: { phone: '+91 22222 22222', version: now.version } });
    assert.equal(retry.status, 200);
    assert.equal(retry.json.version, 3);
  } finally {
    await a.close(); await b.close();
  }
});

test('HTTP: an appointment edit and a lab order edit also answer 409 when the version is old', async () => {
  const store = await memoryStore();
  const s = await startInstance(store);
  try {
    const rec = await s.login('reception');
    const p = (await s.call('POST', '/api/patients', { token: rec, body: patient })).json;
    const doc = (await s.call('GET', '/api/doctors', { token: rec })).json[0];
    const appt = (await s.call('POST', '/api/appointments', { token: rec, body: { patientId: p.id, doctorId: doc.id, date: '2030-01-01', time: '09:00', reason: 'Check' } })).json;
    assert.equal(appt.version, 1);
    assert.equal((await s.call('PATCH', `/api/appointments/${appt.id}`, { token: rec, body: { reason: 'Check 2', version: 1 } })).status, 200);
    const stale = await s.call('PATCH', `/api/appointments/${appt.id}`, { token: rec, body: { reason: 'Check 3', version: 1 } });
    assert.equal(stale.status, 409);
    assert.deepEqual(stale.json, CONFLICT);

    const lab = await s.login('lab');
    const order = (await s.call('POST', '/api/lab/orders', { token: lab, body: { testName: 'CBC', orderingDoctor: 'Dr X', patientGender: 'F', external: true, patientName: 'Ext', patientAge: 30 } })).json.data;
    assert.equal(order.version, 1);
    assert.equal((await s.call('PATCH', `/api/lab/orders/${order.id}`, { token: lab, body: { status: 'collected', version: 1 } })).status, 200);
    const staleOrder = await s.call('PATCH', `/api/lab/orders/${order.id}`, { token: lab, body: { technicianNotes: 'x', version: 1 } });
    assert.equal(staleOrder.status, 409);
    assert.deepEqual(staleOrder.json, CONFLICT);
  } finally {
    await s.close();
  }
});

test('HTTP: two bookings for one doctor slot at once: exactly one wins', async () => {
  const s = await startInstance(await memoryStore());
  try {
    const rec = await s.login();
    const doc = (await s.call('GET', '/api/doctors', { token: rec })).json[0];
    const people = await Promise.all([0, 1].map(async (i) => (await s.call('POST', '/api/patients', { token: rec, body: { ...patient, name: `P${i}`, phone: `+91 9000${i}` } })).json));
    const out = await Promise.all(people.map((p) => s.call('POST', '/api/appointments', { token: rec, body: { patientId: p.id, doctorId: doc.id, date: '2030-02-02', time: '11:00', reason: 'Visit' } })));
    assert.deepEqual(out.map((r) => r.status).sort(), [201, 409]);
  } finally {
    await s.close();
  }
});
