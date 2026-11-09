import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { INDEXES, ConflictError, DuplicateError, createRepos, openMongoStore, type Store } from './repo/index.js';
import { removeUnfinishedSample, SAMPLE_EMAIL } from './services/sampleCleanup.js';
import { SAMPLE_NAME } from './scenario.js';
import { memoryStore, startInstance } from './testing.js';

const person = { name: 'Asha Rao', dob: '1990-02-03', gender: 'Female', phone: '+91 98765 43210', address: 'Chennai' };
/** A patient the signed-in doctor is linked to: the front desk registers them and books the doctor. */
async function linkedPatient(s: Awaited<ReturnType<typeof startInstance>>, doc: string, name = person.name) {
  const rec = await s.login();
  const me = (await s.call('GET', '/api/me', { token: doc })).json;
  const p = (await s.call('POST', '/api/patients', { token: rec, body: { ...person, name } })).json;
  const a = await s.call('POST', '/api/appointments', { token: rec, body: { patientId: p.id, doctorId: me.id ?? me.user?.id, date: new Date().toISOString().slice(0, 10), time: '09:30', reason: 'Visit' } });
  assert.equal(a.status, 201, JSON.stringify(a.json));
  return p;
}
const CONFLICT = 'Record was changed by someone else, reload and retry';

// Transactions need a replica set. A plain local mongod cannot run them, so the MongoDB variant runs only when
// CAREWEAVE_TEST_REPLSET_URI points at one (the memory variant always runs).
async function replSetStore(): Promise<Store | null> {
  const uri = process.env.CAREWEAVE_TEST_REPLSET_URI;
  if (!uri) return null;
  return openMongoStore(uri, `careweave_tx_${process.pid}`, () => {});
}

function suite(name: string, open: () => Promise<Store>) {
  test(`${name}: referrals, care plans, vitals, external records, cases and users reject a stale write`, async () => {
    const repos = createRepos(await open());
    const docs: Array<[keyof typeof repos, any]> = [
      ['referrals', { id: 'r1', status: 'Drafted' }], ['carePlans', { id: 'c1', status: 'Active' }], ['vitals', { id: 'v1', hr: 70 }],
      ['externalRecords', { id: 'e1', status: 'Imported' }], ['cases', { id: 'k1', status: 'open' }], ['users', { id: 'u1', email: 'x@y.test', permissions: [] }],
    ];
    for (const [coll, doc] of docs) {
      const repo: any = repos[coll];
      const first = await repo.insert(doc);
      assert.equal(first.version, 1, `${coll} starts at version 1`);
      const a = await repo.byId(doc.id), b = await repo.byId(doc.id);
      const saved = await repo.update(a, { touched: 1 });
      assert.equal(saved.version, 2);
      await assert.rejects(repo.update(b, { touched: 2 }), ConflictError, `${coll}: the second writer must lose`);
      assert.equal((await repo.byId(doc.id)).touched, 1);
    }
  });

  test(`${name}: a transaction keeps all its writes when it succeeds`, async () => {
    const repos = createRepos(await open());
    await repos.transaction(async (tx) => {
      await tx.encounters.insert({ id: 'enc-1', patientId: 'p' });
      await tx.vitals.insert({ id: 'vt-1', patientId: 'p' });
    });
    assert.ok(await repos.encounters.byId('enc-1'));
    assert.ok(await repos.vitals.byId('vt-1'));
  });

  test(`${name}: a transaction that fails half-way leaves nothing behind, and the error reaches the caller`, async () => {
    const repos = createRepos(await open());
    await repos.vitals.insert({ id: 'vt-taken', patientId: 'p' });
    await assert.rejects(repos.transaction(async (tx) => {
      await tx.encounters.insert({ id: 'enc-2', patientId: 'p' });
      await tx.vitals.insert({ id: 'vt-taken', patientId: 'p' }); // already exists: the second write fails
    }), DuplicateError);
    assert.equal(await repos.encounters.byId('enc-2'), null, 'the first write was undone');
    await assert.rejects(repos.transaction(async (tx) => {
      const r = await tx.vitals.byId('vt-taken');
      await tx.vitals.update(r, { hr: 1 });
      throw new Error('boom');
    }), /boom/);
    assert.equal((await repos.vitals.byId('vt-taken')).hr, undefined, 'an update is undone too');
    assert.equal((await repos.vitals.byId('vt-taken')).version, 1);
  });
}

suite('memory store', memoryStore);
const repl = await replSetStore();
if (repl) {
  suite('MongoDB replica set', async () => { await mongoose.connection.db!.dropDatabase(); await repl.ensureIndexes(INDEXES); return repl; }); // only the database this test run created
  after(async () => { await mongoose.connection.db!.dropDatabase(); await repl.close(); });
}
else test('MongoDB replica set: transactions (skipped, CAREWEAVE_TEST_REPLSET_URI is not set)', { skip: true }, () => {});

test('HTTP: a referral, care plan and review case edited from a stale screen get 409', async () => {
  const s = await startInstance(await memoryStore());
  try {
    const doc = await s.login('doctor');
    const p = await linkedPatient(s, doc);
    const rf = (await s.call('POST', '/api/referrals', { token: doc, body: { patientId: p.id, reason: 'Cardiology opinion', specialty: 'Cardiology' } })).json;
    assert.equal(rf.version, 1);
    assert.equal((await s.call('PATCH', `/api/referrals/${rf.id}`, { token: doc, body: { status: 'Sent', version: 1 } })).status, 200);
    const stale = await s.call('PATCH', `/api/referrals/${rf.id}`, { token: doc, body: { status: 'Completed', version: 1 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error, CONFLICT);

    const cp = (await s.call('POST', '/api/care-plans', { token: doc, body: { patientId: p.id, title: 'Diabetes' } })).json;
    assert.equal((await s.call('PATCH', `/api/care-plans/${cp.id}`, { token: doc, body: { status: 'Completed', version: cp.version } })).status, 200);
    assert.equal((await s.call('PATCH', `/api/care-plans/${cp.id}`, { token: doc, body: { status: 'Active', version: cp.version } })).status, 409);

    const imp = await s.call('POST', '/api/external-records/import', { token: doc, body: { facility: 'Outside Lab', kind: 'lab', sourceRecordId: 'X-9', eventDate: new Date().toISOString().slice(0, 10), patient: { name: 'Nobody Known', dob: '1970-01-01' }, content: { testName: 'HbA1c', value: '7.1', units: '%' } } });
    assert.equal(imp.status, 201, JSON.stringify(imp.json));
    const k = (await s.call('GET', '/api/reconciliation/cases', { token: doc })).json[0];
    assert.equal((await s.call('PATCH', `/api/reconciliation/cases/${k.id}`, { token: doc, body: { decision: 'keep-separate', version: k.version + 3 } })).status, 409);
    assert.equal((await s.call('PATCH', `/api/reconciliation/cases/${k.id}`, { token: doc, body: { decision: 'keep-separate', version: k.version } })).status, 200);
  } finally {
    await s.close();
  }
});

test('HTTP: an encounter and its vitals are saved together; if the vitals fail, no encounter is stored', async () => {
  const store = await memoryStore();
  const s = await startInstance(store);
  try {
    const doc = await s.login('doctor');
    const p = await linkedPatient(s, doc);
    const body = { patientId: p.id, notes: 'Review', vitals: { heartRate: 72 } };
    const ok = await s.call('POST', '/api/encounters', { token: doc, body });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    const repos = createRepos(store);
    assert.equal((await repos.vitals.find({ patientId: p.id })).length, 1);

    const real = store.collection('vitals').insert.bind(store.collection('vitals'));
    store.collection('vitals').insert = async () => { throw new Error('database went away'); };
    const before = (await repos.encounters.find({ patientId: p.id })).length;
    const bad = await s.call('POST', '/api/encounters', { token: doc, body: { ...body, notes: 'Second' } });
    assert.equal(bad.status, 500);
    assert.equal((await repos.encounters.find({ patientId: p.id })).length, before, 'the encounter was rolled back');
    store.collection('vitals').insert = real;
  } finally {
    await s.close();
  }
});

test('HTTP: importing an outside record saves the record with its review case, or neither', async () => {
  const store = await memoryStore();
  const s = await startInstance(store);
  try {
    const doc = await s.login('doctor');
    const rec = { facility: 'Outside Lab', kind: 'lab', sourceRecordId: 'X-1', eventDate: new Date().toISOString().slice(0, 10), patient: { name: 'Nobody Known', dob: '1970-01-01' }, content: { testName: 'HbA1c', value: '7.1', units: '%' } };
    store.collection('cases').insert = async () => { throw new Error('database went away'); };
    const failed = await s.call('POST', '/api/external-records/import', { token: doc, body: rec });
    assert.ok(failed.status >= 400);
    assert.equal(await store.collection('externalRecords').count(), 0, 'no record without its case');
  } finally {
    await s.close();
  }
});

test('a half-loaded sample scenario is removed, but a finished one (flagged sample) is left alone', async () => {
  const repos = createRepos(await memoryStore());
  const mk = (id: string, sample?: boolean) => repos.patients.insert({ id, patientId: `CW-${id}`, name: SAMPLE_NAME, dob: '1984-03-12', phone: '1', email: SAMPLE_EMAIL, ...(sample ? { sample: true } : {}) });
  await mk('p-half'); await mk('p-done', true);
  await repos.appointments.insert({ id: 'a1', patientId: 'p-half', status: 'Scheduled' });
  await repos.encounters.insert({ id: 'e1', patientId: 'p-half' });
  await repos.orders.insert({ id: 'o1', registeredPatientRef: 'p-half' });
  await repos.externalRecords.insert({ id: 'x1', patientId: 'p-half' });
  await repos.cases.insert({ id: 'k1', recordId: 'x1' });
  await repos.appointments.insert({ id: 'a2', patientId: 'p-done', status: 'Scheduled' });
  assert.equal(await removeUnfinishedSample(repos), 1);
  assert.equal(await repos.patients.byId('p-half'), null);
  for (const [r, id] of [['appointments', 'a1'], ['encounters', 'e1'], ['orders', 'o1'], ['externalRecords', 'x1'], ['cases', 'k1']] as const) assert.equal(await (repos[r] as any).byId(id), null, r);
  assert.ok(await repos.patients.byId('p-done'));
  assert.ok(await repos.appointments.byId('a2'));
});
