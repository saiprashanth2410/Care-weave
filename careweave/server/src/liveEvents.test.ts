import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveHub } from './liveEvents.js';
import { createRepos } from './repo/index.js';
import { memoryStore } from './testing.js';

const fakeRes = () => {
  const written: string[] = [];
  const handlers: Record<string, () => void> = {};
  const res: any = {
    status() { return res; }, set() { return res; },
    write: (s: string) => { written.push(s); return true; },
    on: (e: string, f: () => void) => { handlers[e] = f; },
  };
  return { res, written, close: () => handlers.close?.() };
};
const got = (r: { written: string[] }, type: string) => r.written.filter((w) => w.startsWith(`event: ${type}`)).length;
const until = async (cond: () => boolean, ms = 2000) => { const t = Date.now(); while (!cond() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 20)); };

test('a critical alert reaches only the doctors it is meant for, and a closed screen is dropped', async () => {
  const hub = new LiveHub();
  const a = fakeRes(), b = fakeRes();
  hub.addClient(a.res, 'doc-1', 'doctor');
  hub.addClient(b.res, 'doc-2', 'doctor');
  await hub.publish('critical', { patientName: 'X' }, ['doc-1']);
  assert.equal(got(a, 'critical'), 1);
  assert.equal(got(b, 'critical'), 0);
  a.close();
  assert.equal(hub.connectedCount, 1);
  b.close();
});

test('an event published on one instance reaches screens connected to another, once, and not back to its own', async () => {
  const repos = createRepos(await memoryStore());
  const one = new LiveHub(() => repos, 30), two = new LiveHub(() => repos, 30);
  const onOne = fakeRes(), onTwo = fakeRes(), otherDoc = fakeRes();
  one.addClient(onOne.res, 'doc-1', 'doctor');
  two.addClient(onTwo.res, 'doc-1', 'doctor');
  two.addClient(otherDoc.res, 'doc-2', 'doctor');
  await new Promise((r) => setTimeout(r, 60)); // both tails have found their start point
  await one.publish('critical', { orderId: 'ORD-1' }, ['doc-1']);
  await one.publish('change');
  await until(() => got(onTwo, 'critical') >= 1 && got(onTwo, 'change') >= 1);
  assert.equal(got(onTwo, 'critical'), 1);
  assert.equal(got(onTwo, 'change'), 1);
  assert.equal(got(otherDoc, 'critical'), 0, 'targeting holds across instances');
  assert.equal(got(otherDoc, 'change'), 1);
  await new Promise((r) => setTimeout(r, 150)); // several more polls: nothing repeats
  assert.equal(got(onTwo, 'critical'), 1);
  assert.equal(got(onOne, 'critical'), 1, 'the publishing instance delivered it directly, and does not hear its own echo');
  assert.equal(got(onOne, 'change'), 1);
  for (const c of [onOne, onTwo, otherDoc]) c.close();
});

test('events from before a screen connected are not replayed to it', async () => {
  const repos = createRepos(await memoryStore());
  const one = new LiveHub(() => repos, 30), two = new LiveHub(() => repos, 30);
  await one.publish('change');
  const late = fakeRes();
  two.addClient(late.res, 'doc-1', 'doctor');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(got(late, 'change'), 0);
  late.close();
});

test('if the shared store fails, publishing still reaches local screens and does not throw', async () => {
  const repos = createRepos(await memoryStore());
  repos.liveEvents.insert = async () => { throw new Error('database went away'); };
  const hub = new LiveHub(() => repos, 30);
  const a = fakeRes();
  hub.addClient(a.res, 'u', 'doctor');
  await hub.publish('change');
  assert.equal(got(a, 'change'), 1);
  a.close();
});

test('with a change stream an event reaches another instance without waiting for the poll', async (t) => {
  const mongoose = (await import('mongoose')).default;
  const { openMongoStore } = await import('./repo/index.js');
  const { TEST_MONGODB_URI } = await import('./testing.js');
  const probe = await mongoose.createConnection(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 1500 }).asPromise().catch(() => null);
  if (!probe) return t.skip('no MongoDB reachable');
  await probe.close();
  const store = await openMongoStore(TEST_MONGODB_URI, `careweave_live_${process.pid}`, () => {});
  const onTwo = fakeRes();
  try {
    const repos = createRepos(store);
    const one = new LiveHub(() => repos, 60_000), two = new LiveHub(() => repos, 60_000);
    two.addClient(onTwo.res, 'doc-1', 'doctor');
    await new Promise((r) => setTimeout(r, 1800));
    try { await store.watchInserts!('liveEvents', () => {}, () => {}).then((stop) => stop()); } catch { return t.skip('MongoDB is not a replica set: no change streams'); }
    await one.publish('critical', { orderId: 'ORD-9' }, ['doc-1']);
    await until(() => got(onTwo, 'critical') >= 1, 3000); // far sooner than the 60 s poll
    assert.equal(got(onTwo, 'critical'), 1);
  } finally {
    onTwo.close();
    await store.close();
  }
});
