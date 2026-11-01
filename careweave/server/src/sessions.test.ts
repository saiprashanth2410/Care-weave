import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { memoryStore, startInstance } from './testing.js';
import { hashToken } from './services/sessions.js';

// Two server instances over one store stand in for two serverless instances over one database.

test('a session started on one instance is accepted by another, and the store never holds the raw token', async () => {
  const store = await memoryStore();
  const a = await startInstance(store);
  const b = await startInstance(store);
  try {
    const token = await a.login();
    assert.ok(token);
    const me = await b.call('GET', '/api/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.json.role, 'receptionist');

    const docs = await store.collection('sessions').find();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].tokenHash, crypto.createHash('sha256').update(token).digest('hex'));
    assert.deepEqual(Object.keys(docs[0]).sort(), ['expiresAt', 'tokenHash', 'userId']);
    assert.ok(docs[0].expiresAt instanceof Date);
    assert.ok(!JSON.stringify(docs).includes(token), 'the raw token must not be stored');
  } finally {
    await a.close(); await b.close();
  }
});

test('logout deletes the session document, so every instance refuses the token afterwards', async () => {
  const store = await memoryStore();
  const a = await startInstance(store);
  const b = await startInstance(store);
  try {
    const token = await a.login();
    assert.equal((await b.call('GET', '/api/me', { token })).status, 200);
    assert.equal((await a.call('POST', '/api/auth/logout', { token })).status, 200);
    assert.equal((await store.collection('sessions').count()), 0);
    assert.equal((await a.call('GET', '/api/me', { token })).status, 401);
    assert.equal((await b.call('GET', '/api/me', { token })).status, 401);
  } finally {
    await a.close(); await b.close();
  }
});

test('an expired session is refused, and an unknown token is refused', async () => {
  const store = await memoryStore();
  const a = await startInstance(store);
  try {
    const user = await a.repos.users.byEmail('reception@careweave.test');
    await a.repos.sessions.create(hashToken('old-token'), user.id, new Date(Date.now() - 1000));
    assert.equal((await a.call('GET', '/api/me', { token: 'old-token' })).status, 401);
    assert.equal((await a.call('GET', '/api/me', { token: 'never-issued' })).status, 401);
    assert.equal((await a.call('GET', '/api/me')).status, 401);
  } finally {
    await a.close();
  }
});

test('sessions are not written to the JSON file used as the development fallback', async () => {
  const { LocalStore } = await import('./repo/index.js');
  const { buildSeed } = await import('./seed.js');
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'cw-')), 'data.json');
  const store = new LocalStore(file);
  await store.load(async () => ({ ...(await buildSeed()) }));
  const a = await startInstance(store);
  try {
    await a.login();
    await store.collection('patients').insert({ id: 'p-x', patientId: 'CW-9', name: 'X', dob: '2000-01-01', phone: '1' }); // forces a save
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(saved.sessions, undefined);
    assert.equal(saved.patients[0].version, 1);
  } finally {
    await a.close();
  }
});
