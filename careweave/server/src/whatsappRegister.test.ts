import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';
import { createRepos } from './repo/index.js';
import { replyFor } from './services/whatsappData.js';
import { parseDob } from './services/whatsappRegister.js';

const PHONE = '919876501234';

async function setup() {
  const store = await memoryStore();
  return { store, repos: createRepos(store) };
}
const say = async (repos: any, body: string, phone = PHONE) => (await replyFor(repos, phone, body)).reply;

test('whatsapp register: dates are read as DD-MM-YYYY and impossible ones are refused', () => {
  assert.equal(parseDob('27-08-1995'), '1995-08-27');
  assert.equal(parseDob('7/8/1995'), '1995-08-07');
  assert.equal(parseDob('1995-08-27'), '1995-08-27');
  assert.equal(parseDob('31-02-1995'), null);
  assert.equal(parseDob('27-08-2999'), null);
  assert.equal(parseDob('27-08-1800'), null);
  assert.equal(parseDob('yesterday'), null);
});

test('whatsapp register: an unregistered number is locked out of QUEUE, REPORT and MEDS until it registers', async () => {
  const { repos } = await setup();
  for (const word of ['hi', 'QUEUE', 'REPORT CW-12345', 'MEDS CW-12345']) {
    const r = await say(repos, word);
    assert.match(r, /not registered/i, word);
    assert.match(r, /REGISTER/, word);
    assert.ok(!/token is|prescri|verified/i.test(r), `${word} must not leak anything`);
  }
  assert.equal((await repos.patients.find({})).length, 0);
});

test('whatsapp register: three answers create the patient and unlock the normal menu', async () => {
  const { repos } = await setup();
  assert.match(await say(repos, 'REGISTER'), /full name/i);
  assert.match(await say(repos, '1234'), /letters only/i);
  assert.match(await say(repos, 'Anbu Selvan'), /date of birth/i);
  assert.match(await say(repos, 'tomorrow'), /does not look right/i);
  assert.match(await say(repos, '27-08-1995'), /Gender/i);
  assert.match(await say(repos, '9'), /\*1\*/);
  const done = await say(repos, '1');
  const [p] = await repos.patients.find({});
  assert.match(done, /Registered, Anbu Selvan/);
  assert.match(done, new RegExp(p.patientId));
  assert.equal(p.dob, '1995-08-27');
  assert.equal(p.gender, 'M');
  assert.equal(p.source, 'whatsapp');
  assert.equal(p.idVerified, false);
  assert.equal(p.phone, `+${PHONE}`);
  assert.equal((await repos.audit.find({ entityId: p.id })).length, 1);

  // Now the number is known: the normal bot answers and REGISTER is no longer offered.
  assert.match(await say(repos, 'QUEUE'), /not in today's queue/i);
  assert.match(await say(repos, 'hi'), /CareWeave on WhatsApp/);
  assert.equal((await repos.whatsappSignups.get(PHONE.slice(-10))), null);
});

test('whatsapp register: CANCEL stops it and a same-name same-birthday record under another number is not duplicated', async () => {
  const { repos } = await setup();
  await say(repos, 'REGISTER');
  await say(repos, 'Anbu Selvan');
  assert.match(await say(repos, 'CANCEL'), /cancelled/i);
  assert.match(await say(repos, 'hi'), /not registered/i);

  await repos.patients.insert({ id: 'p-old', patientId: 'CW-11111', name: 'Anbu Selvan', dob: '1995-08-27', gender: 'M', phone: '+919000000000', createdAt: new Date().toISOString() });
  await say(repos, 'REGISTER');
  await say(repos, 'anbu selvan');
  await say(repos, '27-08-1995');
  assert.match(await say(repos, '1'), /front desk/i);
  assert.equal((await repos.patients.find({})).length, 1);
});

test('whatsapp register: Tamil is used once the sender picked it, and the language switch works before registering', async () => {
  const { repos } = await setup();
  assert.match(await say(repos, 'LANG TA'), /தமிழுக்கு/);
  assert.match(await say(repos, 'REGISTER'), /படி 1\/3/);
});

test('whatsapp register: works end to end through the staff simulator endpoint', async () => {
  const srv = await startInstance(await memoryStore());
  try {
    const token = await srv.login('reception');
    const sim = (message: string) => srv.call('POST', '/api/whatsapp/simulate', { token, body: { phone: '+91 98765 77777', message } });
    assert.match((await sim('hi')).json.reply, /not registered/i);
    await sim('REGISTER'); await sim('Meena K'); await sim('01-01-2000');
    assert.match((await sim('2')).json.reply, /Registered, Meena K/);
  } finally { await srv.close(); }
});
