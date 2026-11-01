import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';

const bad = (s: Awaited<ReturnType<typeof startInstance>>) =>
  s.call('POST', '/api/auth/login', { body: { email: 'doctor@careweave.test', password: 'wrong' } });

test('the login limit is shared by every instance: 10 failures across two instances, then 429 on both', async () => {
  const store = await memoryStore();
  const a = await startInstance(store);
  const b = await startInstance(store);
  try {
    for (let i = 0; i < 10; i++) assert.equal((await bad(i % 2 ? a : b)).status, 401);
    const blockedA = await bad(a);
    const blockedB = await bad(b);
    assert.equal(blockedA.status, 429);
    assert.equal(blockedB.status, 429);
    assert.ok(Number(blockedA.headers.get('retry-after')) > 0);
    // Even the correct password is refused while the window is open, and another account is not affected.
    assert.equal((await a.call('POST', '/api/auth/login', { body: { email: 'doctor@careweave.test', password: 'demo123' } })).status, 429);
    assert.equal((await a.call('POST', '/api/auth/login', { body: { email: 'lab@careweave.test', password: 'demo123' } })).status, 200);
  } finally {
    await a.close(); await b.close();
  }
});

test('a new instance over the same store still sees the earlier failures (a restart does not reset the limit)', async () => {
  const store = await memoryStore();
  const first = await startInstance(store);
  for (let i = 0; i < 10; i++) await bad(first);
  await first.close();
  const second = await startInstance(store);
  try {
    assert.equal((await bad(second)).status, 429);
  } finally {
    await second.close();
  }
});
