import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepos } from './repo/index.js';
import type { ExasolPort } from './exasol/sync.js';
import { overviewSnapshot, pagedSource, runAnalyticsSync } from './services/analytics.js';
import { memoryStore } from './testing.js';

process.env.ANALYTICS_SYNC_OVERLAP_MS = '0'; // the production default re-reads the last 5 s; tests change records within milliseconds
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const appt = (i: number, over: any = {}) => ({ id: `a-${String(i).padStart(5, '0')}`, patientId: 'p', doctorName: 'Dr', date: today, time: '09:00', reason: 'Visit', status: 'Completed', ...over });

/** An Exasol that remembers what it was asked to MERGE, and answers the count-back queries consistently. */
function fakeExasol(opts: { up?: boolean } = {}) {
  const rows: Record<string, Set<string>> = {}; // a MERGE is an upsert, so Exasol holds each key once
  const merged = new Proxy({} as Record<string, number>, { get: (_t, k: string) => rows[k]?.size ?? 0 });
  const calls: string[] = [];
  let lastBatch = 0, lastTable = '';
  const port: ExasolPort = {
    ping: async () => opts.up !== false,
    init: async () => {},
    schema: () => 'S',
    query: async (sql: string) => {
      calls.push(sql);
      const m = /^MERGE INTO (\w+)/.exec(sql);
      if (m) {
        lastTable = m[1];
        const tuples = sql.slice(sql.indexOf('VALUES (') + 8, sql.indexOf(') AS v(')).split('), (');
        lastBatch = tuples.length;
        rows[lastTable] ??= new Set();
        for (const t of tuples) rows[lastTable].add(t.split(', ')[0]);
        return [];
      }
      if (/WHERE .* IN \(/.test(sql) && /^SELECT COUNT/.test(sql)) return [{ n: lastBatch }];
      if (/FROM DUAL/.test(sql)) return [{ v: merged.FACT_PATIENT_VISITS ?? 0, l: merged.FACT_LAB_ORDERS_TAT ?? 0, p: merged.FACT_PHARMACY_PRESCRIPTIONS ?? 0 }];
      return [];
    },
  };
  return { port, merged, calls };
}

test('the sync source reads a collection a page at a time, in order, without repeats', async () => {
  const repos = createRepos(await memoryStore());
  await repos.appointments.insertMany(Array.from({ length: 1203 }, (_, i) => appt(i)));
  const sizes: number[] = [], ids: string[] = [];
  for await (const page of pagedSource(repos).pages('appointments')) { sizes.push(page.length); ids.push(...page.map((a: any) => a.id)); }
  assert.deepEqual(sizes, [500, 500, 203]);
  assert.equal(new Set(ids).size, 1203);
  assert.deepEqual(ids, [...ids].sort());
});

test('inserts and updates stamp updatedAt, and a since-query returns only what changed', async () => {
  const repos = createRepos(await memoryStore());
  await repos.appointments.insertMany([appt(1), appt(2), appt(3)]);
  const first = await repos.appointments.byId('a-00001');
  assert.ok(first.updatedAt);
  await new Promise((r) => setTimeout(r, 15));
  const since = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 15));
  await repos.appointments.update(await repos.appointments.byId('a-00002'), { reason: 'Changed' });
  const changed: string[] = [];
  for await (const page of pagedSource(repos).pages('appointments', since)) changed.push(...page.map((a: any) => a.id));
  assert.deepEqual(changed, ['a-00002']);
});

test('first sync is full, the next loads only what changed, and a failed sync does not move the watermark', async () => {
  const repos = createRepos(await memoryStore());
  await repos.appointments.insertMany(Array.from({ length: 700 }, (_, i) => appt(i)));
  const x = fakeExasol();
  await new Promise((r) => setTimeout(r, 10)); // the watermark comparison is inclusive; keep the inserts clearly before it

  const one = await runAnalyticsSync(repos, { port: x.port });
  assert.ok(one.success && !one.busy);
  assert.equal(one.mode, 'full');
  assert.equal(one.syncedVisits, 700);

  await new Promise((r) => setTimeout(r, 20));
  await repos.appointments.update(await repos.appointments.byId('a-00005'), { status: 'Cancelled' });
  const two = await runAnalyticsSync(repos, { port: x.port });
  assert.ok(two.success && !two.busy);
  assert.equal(two.mode, 'incremental');
  assert.equal(two.syncedVisits, 1, 'only the changed visit is loaded, not all 700');

  const down = await runAnalyticsSync(repos, { port: fakeExasol({ up: false }).port });
  assert.equal(down.success, false);
  const m = await repos.meta.byId('exasol-sync');
  assert.ok(m.watermark, 'watermark kept');
  assert.equal(m.lockedUntil, undefined, 'the lock is released even after a failure');

  const forced = await runAnalyticsSync(repos, { port: x.port, full: true });
  assert.ok(forced.success && !forced.busy);
  assert.equal(forced.mode, 'full');
  assert.equal(forced.syncedVisits, 700);
});

test('a full sync removes Exasol rows whose source is gone; an incremental one never deletes', async () => {
  const repos = createRepos(await memoryStore());
  await repos.appointments.insertMany([appt(1), appt(2)]);
  const x = fakeExasol();
  await runAnalyticsSync(repos, { port: x.port });
  assert.ok(x.calls.some((c) => /^DELETE FROM FACT_PATIENT_VISITS WHERE VISIT_ID NOT IN/.test(c)), 'full sync prunes');
  const before = x.calls.length;
  await new Promise((r) => setTimeout(r, 20));
  await repos.appointments.update(await repos.appointments.byId('a-00001'), { reason: 'x' });
  await runAnalyticsSync(repos, { port: x.port });
  assert.ok(!x.calls.slice(before).some((c) => /^DELETE/.test(c)), 'incremental does not delete');
});

test('two syncs at once: one runs, the other is told it is busy', async () => {
  const repos = createRepos(await memoryStore());
  await repos.appointments.insertMany(Array.from({ length: 50 }, (_, i) => appt(i)));
  const [a, b] = await Promise.all([runAnalyticsSync(repos, { port: fakeExasol().port }), runAnalyticsSync(repos, { port: fakeExasol().port })]);
  assert.equal([a, b].filter((r) => r.busy).length, 1);
  assert.equal([a, b].filter((r) => r.success).length, 1);
});

test('the offline overview reads only the recent window, and takes totals from counts', async () => {
  const repos = createRepos(await memoryStore());
  await repos.patients.insert({ id: 'p1', patientId: 'CW-1', name: 'A', dob: '2000-01-01', phone: '1' });
  await repos.appointments.insertMany([appt(1), appt(2, { date: '2020-01-01' })]);
  await repos.orders.insertMany([{ id: 'o1', orderedAt: daysAgo(2), status: 'released' }, { id: 'o2', orderedAt: daysAgo(400), status: 'released' }]);
  await repos.prescriptions.insertMany([{ id: 'r1', date: daysAgo(1) }, { id: 'r2', date: daysAgo(500) }]);
  const snap = await overviewSnapshot(repos, 90);
  assert.deepEqual(snap.appointments.map((a: any) => a.id), ['a-00001']);
  assert.deepEqual(snap.labOrders.map((o: any) => o.id), ['o1']);
  assert.deepEqual(snap.prescriptions.map((r: any) => r.id), ['r1']);
  assert.deepEqual(snap.counts, { patients: 1, appointments: 2, labOrders: 2, prescriptions: 2 });
  assert.equal(snap.patients.length, 0, 'no patient documents are loaded');
});

test('HTTP: the scheduled-sync endpoint needs the cron secret and is off without one', async () => {
  const { startInstance } = await import('./testing.js');
  const s = await startInstance(await memoryStore());
  const was = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await s.call('GET', '/api/analytics/cron')).status, 503);
    process.env.CRON_SECRET = 'right-secret';
    assert.equal((await s.call('GET', '/api/analytics/cron')).status, 401);
    assert.equal((await s.call('GET', '/api/analytics/cron', { headers: { authorization: 'Bearer wrong' } })).status, 401);
    const ok = await s.call('GET', '/api/analytics/cron', { headers: { authorization: 'Bearer right-secret' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.skipped, true, 'Exasol is not configured in tests, so nothing runs');
  } finally {
    if (was === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = was;
    await s.close();
  }
});
