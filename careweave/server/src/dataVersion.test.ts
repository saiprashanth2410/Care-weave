import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';

const person = (n: number) => ({ name: `Version Patient ${n}`, dob: '1990-01-01', gender: 'Female', phone: `+91 9000${n}1111`, address: 'Chennai' });

test('changes: needs a sign-in, and the token moves only when something was saved', async () => {
  const srv = await startInstance(await memoryStore());
  try {
    assert.equal((await srv.call('GET', '/api/changes')).status, 401);
    const rec = await srv.login('reception');
    const v0 = (await srv.call('GET', '/api/changes', { token: rec })).json.version;

    // Reading, and signing in, change nothing
    await srv.call('GET', '/api/patients', { token: rec });
    await srv.call('GET', '/api/appointments', { token: rec });
    await srv.login('doctor');
    assert.equal((await srv.call('GET', '/api/changes', { token: rec })).json.version, v0);

    // A refused save changes nothing either
    assert.equal((await srv.call('POST', '/api/patients', { token: rec, body: { name: 'x' } })).status >= 400, true);
    assert.equal((await srv.call('GET', '/api/changes', { token: rec })).json.version, v0);

    // A real save moves it, and each further save moves it again
    assert.equal((await srv.call('POST', '/api/patients', { token: rec, body: person(1) })).status, 201);
    const v1 = (await srv.call('GET', '/api/changes', { token: rec })).json.version;
    assert.ok(v1 && v1 !== v0);
    assert.equal((await srv.call('POST', '/api/patients', { token: rec, body: person(2) })).status, 201);
    const v2 = (await srv.call('GET', '/api/changes', { token: rec })).json.version;
    assert.ok(v2 && v2 !== v1);
  } finally { await srv.close(); }
});

test('changes: a save on one server instance is seen by another sharing the database', async () => {
  const store = await memoryStore();
  const a = await startInstance(store);
  const b = await startInstance(store);
  try {
    const recA = await a.login('reception');
    const recB = await b.login('reception');
    const before = (await b.call('GET', '/api/changes', { token: recB })).json.version;
    assert.equal((await a.call('POST', '/api/patients', { token: recA, body: person(3) })).status, 201);
    const after = (await b.call('GET', '/api/changes', { token: recB })).json.version;
    assert.notEqual(after, before);
  } finally { await a.close(); await b.close(); }
});

test('changes: many saves at once all finish, and the token still ends up different from before', async () => {
  const srv = await startInstance(await memoryStore());
  try {
    const rec = await srv.login('reception');
    const before = (await srv.call('GET', '/api/changes', { token: rec })).json.version;
    const out = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => srv.call('POST', '/api/patients', { token: rec, body: { ...person(n), phone: `+91 9100${n}2222` } })));
    assert.deepEqual(out.map((r) => r.status), [201, 201, 201, 201, 201, 201]);
    assert.notEqual((await srv.call('GET', '/api/changes', { token: rec })).json.version, before);
  } finally { await srv.close(); }
});
