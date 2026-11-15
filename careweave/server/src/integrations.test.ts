import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';
import { forgetAiConfig, readAiConfig } from './services/aiConfig.js';

const KEY = 'AIzaSyTestKeyForCareWeave1234567890abcd';
const URL = '/api/integrations/gemini';

async function setup() {
  forgetAiConfig();
  const srv = await startInstance(await memoryStore());
  const admin = await srv.login('admin');
  const put = (body: object) => srv.call('PUT', URL, { token: admin, body });
  const unlock = (passcode: string) => srv.call('POST', `${URL}/unlock`, { token: admin, body: { passcode } });
  return { srv, admin, put, unlock };
}

test('integrations: only an administrator can see or change the Gemini key', async () => {
  const { srv } = await setup();
  try {
    assert.equal((await srv.call('GET', URL)).status, 401);
    for (const who of ['doctor', 'lab', 'reception']) {
      const token = await srv.login(who);
      assert.equal((await srv.call('GET', URL, { token })).status, 403, who);
      assert.equal((await srv.call('PUT', URL, { token, body: { apiKey: KEY, passcode: '1234' } })).status, 403, who);
    }
  } finally { await srv.close(); }
});

test('integrations: the key is stored sealed, and only its last four characters come back', async () => {
  const { srv, admin, put } = await setup();
  try {
    const empty = (await srv.call('GET', URL, { token: admin })).json;
    assert.equal(empty.configured, false);
    assert.equal(empty.hasPasscode, false);

    assert.equal((await put({ apiKey: 'short', passcode: '1234' })).status, 400);
    assert.equal((await put({ apiKey: KEY, passcode: '12' })).status, 400);
    const saved = await put({ apiKey: KEY, passcode: '4321' });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.json.configured, true);
    assert.equal(saved.json.source, 'admin');
    assert.equal(saved.json.last4, KEY.slice(-4));
    assert.equal(saved.json.hasPasscode, true);
    assert.ok(!saved.text.includes(KEY), 'the response never carries the key');
    assert.ok(!(await srv.call('GET', URL, { token: admin })).text.includes(KEY));

    const stored = JSON.stringify(await srv.repos.meta.byId('ai-config'));
    assert.ok(!stored.includes(KEY), 'the database holds only the sealed key');
    assert.ok(!stored.includes('4321'), 'and never the passcode');
    assert.equal((await readAiConfig(srv.repos)).key, KEY, 'the server can read it back for the scanner and brief');
  } finally { await srv.close(); }
});

test('integrations: the key is shown only after the right passcode, and wrong guesses lock it for a while', async () => {
  const { srv, put, unlock } = await setup();
  try {
    await put({ apiKey: KEY, passcode: '4321' });
    const ok = await unlock('4321');
    assert.equal(ok.status, 200);
    assert.equal(ok.json.apiKey, KEY);

    for (let i = 0; i < 4; i++) assert.equal((await unlock('0000')).status, 403);
    const fifth = await unlock('0000');
    assert.equal(fifth.status, 403);
    assert.match(fifth.json.error, /Too many/);
    const locked = await unlock('4321');
    assert.equal(locked.status, 429, 'even the right passcode is refused while locked');
    assert.ok(!locked.text.includes(KEY));
  } finally { await srv.close(); }
});

test('integrations: replacing the key, changing the passcode and removing the key all need the passcode', async () => {
  const { srv, admin, put, unlock } = await setup();
  try {
    await put({ apiKey: KEY, passcode: '4321' });
    const NEW = 'AIzaSyAnotherKeyForCareWeave0987654321zz';
    assert.equal((await put({ apiKey: NEW, passcode: 'wrong' })).status, 403);
    assert.equal((await unlock('4321')).json.apiKey, KEY, 'still the old key');
    assert.equal((await put({ apiKey: NEW, passcode: '4321' })).json.last4, NEW.slice(-4));
    assert.equal((await unlock('4321')).json.apiKey, NEW);

    assert.equal((await srv.call('POST', `${URL}/passcode`, { token: admin, body: { currentPasscode: 'bad', newPasscode: '9999' } })).status, 403);
    assert.equal((await srv.call('POST', `${URL}/passcode`, { token: admin, body: { currentPasscode: '4321', newPasscode: '99' } })).status, 400);
    assert.equal((await srv.call('POST', `${URL}/passcode`, { token: admin, body: { currentPasscode: '4321', newPasscode: '9999' } })).status, 200);
    assert.equal((await unlock('4321')).status, 403);
    assert.equal((await unlock('9999')).json.apiKey, NEW);

    assert.equal((await srv.call('DELETE', URL, { token: admin, body: { passcode: '4321' } })).status, 403);
    const gone = await srv.call('DELETE', URL, { token: admin, body: { passcode: '9999' } });
    assert.equal(gone.status, 200);
    assert.equal(gone.json.configured, false);
    assert.equal((await readAiConfig(srv.repos)).key, '');
  } finally { await srv.close(); }
});

test('integrations: the scanner says why it cannot run, and the switch turns the scanner and the brief off', async () => {
  const { srv, admin, put } = await setup();
  try {
    const lab = await srv.login('lab');
    const scan = () => srv.call('POST', '/api/lab/extract', { token: lab, body: { mimeType: 'image/png', data: 'AAAA' } });
    const before = await scan();
    assert.equal(before.status, 503);
    assert.match(before.json.error, /not set up/);

    await put({ apiKey: KEY, passcode: '4321' });
    const off = await srv.call('PATCH', `${URL}/options`, { token: admin, body: { scan: false, brief: false, model: 'gemini-test-model' } });
    assert.equal(off.status, 200, off.text);
    assert.deepEqual(off.json.features, { scan: false, brief: false });
    assert.equal(off.json.model, 'gemini-test-model');
    forgetAiConfig();
    const switched = await scan();
    assert.equal(switched.status, 503);
    assert.match(switched.json.error, /switched off/);

    assert.equal((await srv.call('PATCH', `${URL}/options`, { token: admin, body: { model: 'bad model!' } })).status, 400);
    assert.deepEqual((await srv.call('PATCH', `${URL}/options`, { token: admin, body: { scan: true } })).json.features, { scan: true, brief: false });
  } finally { await srv.close(); }
});

test('integrations: every change is in the audit log, and the log never holds the key', async () => {
  const { srv, admin, put, unlock } = await setup();
  try {
    await put({ apiKey: KEY, passcode: '4321' });
    await unlock('4321');
    await srv.call('DELETE', URL, { token: admin, body: { passcode: '4321' } });
    const log = (await srv.call('GET', '/api/audit?entity=integration&limit=50', { token: admin })).text;
    assert.ok(log.includes('Set the Gemini API key') && log.includes('Unlocked the Gemini API key') && log.includes('Removed the Gemini API key'));
    assert.ok(!log.includes(KEY) && !log.includes('4321'));
  } finally { await srv.close(); }
});

test('integrations: a test with a malformed key or no key at all is answered without calling Google', async () => {
  const { srv, admin } = await setup();
  try {
    const bad = await srv.call('POST', `${URL}/test`, { token: admin, body: { apiKey: 'nope' } });
    assert.equal(bad.json.ok, false);
    const none = await srv.call('POST', `${URL}/test`, { token: admin, body: {} });
    assert.equal(none.json.ok, false);
    assert.match(none.json.error, /no key to test/i);
  } finally { await srv.close(); }
});
