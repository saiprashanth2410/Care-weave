import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepos } from './repo/index.js';
import { readStartupStamp, startupStamp, writeStartupStamp } from './services/startup.js';
import { memoryStore } from './testing.js';

test('start-up stamp: the same on every call, so a matching stamp really means the set-up was done for this code', async () => {
  const a = await startupStamp();
  const b = await startupStamp();
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{40}$/);
});

test('start-up stamp: nothing saved at first, then what was written is what is read, and a rewrite replaces it', async () => {
  const repos = createRepos(await memoryStore());
  assert.equal(await readStartupStamp(repos), undefined);
  await writeStartupStamp(repos, 'abc');
  assert.equal(await readStartupStamp(repos), 'abc');
  await writeStartupStamp(repos, 'def');
  assert.equal(await readStartupStamp(repos), 'def');
  assert.equal((await repos.meta.find({ id: 'startup' })).length, 1, 'one row, not a new one each time');
});
