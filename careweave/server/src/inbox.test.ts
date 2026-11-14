import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';

async function setup() {
  const srv = await startInstance(await memoryStore());
  return { srv, admin: await srv.login('admin'), reception: await srv.login('reception'), doctor: await srv.login('doctor') };
}
const items = async (srv: any, admin: string, status = 'all') => (await srv.call('GET', `/api/inbox?status=${status}`, { token: admin })).json;

test('help request: works before sign-in, answers the same for staff and strangers, and the administrator sees who is who', async () => {
  const { srv, admin } = await setup();
  try {
    const known = await srv.call('POST', '/api/support/request', { body: { email: 'Reception@careweave.test', message: 'I forgot my password' } });
    const stranger = await srv.call('POST', '/api/support/request', { body: { email: 'nobody@example.test' } });
    assert.equal(known.status, 202);
    assert.equal(stranger.status, 202);
    assert.deepEqual(known.json, stranger.json, 'the answer does not reveal which addresses are staff');
    assert.equal((await srv.call('POST', '/api/support/request', { body: { email: 'not-an-email' } })).status, 400);

    const { items: list, counts } = await items(srv, admin);
    assert.equal(list.length, 2);
    assert.equal(counts.new, 2);
    const k = list.find((m: any) => m.fromEmail === 'reception@careweave.test');
    assert.equal(k.knownStaff, true);
    assert.equal(k.fromName, 'Maya Patel');
    assert.equal(k.fromRole, 'receptionist');
    assert.ok(k.staffId, 'the message carries the staff account, so a reset link can be sent from it');
    assert.equal(k.message, 'I forgot my password');
    const s = list.find((m: any) => m.fromEmail === 'nobody@example.test');
    assert.equal(s.knownStaff, false);
    assert.equal(s.staffId, '');
  } finally { await srv.close(); }
});

test('help request: asking again while one is open adds to it, a resolved one starts a new message, and one address cannot flood', async () => {
  const { srv, admin } = await setup();
  try {
    const ask = () => srv.call('POST', '/api/support/request', { body: { email: 'again@example.test' } });
    assert.equal((await ask()).status, 202);
    assert.equal((await ask()).status, 202);
    let list = (await items(srv, admin)).items;
    assert.equal(list.length, 1);
    assert.equal(list[0].count, 2);

    await srv.call('PATCH', `/api/inbox/${list[0].id}`, { token: admin, body: { status: 'resolved' } });
    assert.equal((await ask()).status, 202); // third in the window: still allowed
    list = (await items(srv, admin)).items;
    assert.equal(list.length, 2, 'after it was resolved, a new request is a new message');

    assert.equal((await ask()).status, 429, 'a fourth in half an hour from one address is refused');
  } finally { await srv.close(); }
});

test('problem report: a signed-in person sends one with their name and role attached; it needs a sign-in and a real description', async () => {
  const { srv, admin, doctor } = await setup();
  try {
    assert.equal((await srv.call('POST', '/api/support/issue', { body: { message: 'The page is blank' } })).status, 401);
    assert.equal((await srv.call('POST', '/api/support/issue', { token: doctor, body: { message: 'hi' } })).status, 400);
    const sent = await srv.call('POST', '/api/support/issue', { token: doctor, body: { subject: 'Lab list empty', message: 'The lab orders list shows nothing since morning.', page: '/doctor' } });
    assert.equal(sent.status, 201);

    const m = (await items(srv, admin)).items[0];
    assert.equal(m.kind, 'issue');
    assert.equal(m.subject, 'Lab list empty');
    assert.equal(m.fromName, 'Dr. ANIRBAN LAHA');
    assert.equal(m.fromRole, 'doctor');
    assert.equal(m.page, '/doctor');
    assert.equal(m.status, 'new');
  } finally { await srv.close(); }
});

test('inbox: only administrators read or change it', async () => {
  const { srv, admin, reception, doctor } = await setup();
  try {
    await srv.call('POST', '/api/support/issue', { token: doctor, body: { message: 'Something is wrong here' } });
    const id = (await items(srv, admin)).items[0].id;
    for (const [m, p, body] of [['GET', '/api/inbox'], ['GET', '/api/inbox/summary'], ['PATCH', `/api/inbox/${id}`, { status: 'read' }]] as any[]) {
      assert.equal((await srv.call(m, p, { token: reception, body })).status, 403, `${m} ${p}`);
      assert.equal((await srv.call(m, p, { token: doctor, body })).status, 403, `${m} ${p}`);
      assert.equal((await srv.call(m, p, { body })).status, 401, `${m} ${p}`);
    }
  } finally { await srv.close(); }
});

test('inbox: read, resolve and reopen change the counts, the badge number and who resolved it', async () => {
  const { srv, admin, doctor } = await setup();
  try {
    await srv.call('POST', '/api/support/issue', { token: doctor, body: { message: 'First problem here' } });
    await srv.call('POST', '/api/support/issue', { token: doctor, body: { message: 'Second problem here' } });
    assert.equal((await srv.call('GET', '/api/inbox/summary', { token: admin })).json.new, 2);

    const list = (await items(srv, admin)).items;
    const read = await srv.call('PATCH', `/api/inbox/${list[0].id}`, { token: admin, body: { status: 'read' } });
    assert.equal(read.json.status, 'read');
    assert.ok(read.json.readAt);
    assert.equal((await srv.call('GET', '/api/inbox/summary', { token: admin })).json.new, 1);

    const done = await srv.call('PATCH', `/api/inbox/${list[0].id}`, { token: admin, body: { status: 'resolved', note: 'Reset their cache' } });
    assert.equal(done.json.status, 'resolved');
    assert.equal(done.json.resolvedBy, 'Ravi Menon');
    assert.equal(done.json.note, 'Reset their cache');
    assert.deepEqual((await items(srv, admin)).counts, { new: 1, read: 0, resolved: 1 });
    assert.equal((await items(srv, admin, 'open')).items.length, 1);
    assert.equal((await items(srv, admin, 'resolved')).items.length, 1);

    const reopened = await srv.call('PATCH', `/api/inbox/${list[0].id}`, { token: admin, body: { status: 'new' } });
    assert.equal(reopened.json.status, 'new');
    assert.equal(reopened.json.resolvedBy, undefined);
    assert.equal((await srv.call('PATCH', `/api/inbox/${list[0].id}`, { token: admin, body: { status: 'bogus' } })).status, 400);
    assert.equal((await srv.call('PATCH', '/api/inbox/nope', { token: admin, body: { status: 'read' } })).status, 404);
  } finally { await srv.close(); }
});

test('inbox: a new request moves the change token, so an open admin portal notices without a reload', async () => {
  const { srv, admin } = await setup();
  try {
    const before = (await srv.call('GET', '/api/changes', { token: admin })).json.version;
    await srv.call('POST', '/api/support/request', { body: { email: 'token@example.test' } });
    assert.notEqual((await srv.call('GET', '/api/changes', { token: admin })).json.version, before);
  } finally { await srv.close(); }
});

test('inbox: resolving is recorded in the audit log, plain reading is not', async () => {
  const { srv, admin, doctor } = await setup();
  try {
    await srv.call('POST', '/api/support/issue', { token: doctor, body: { subject: 'Audit me', message: 'Please look at this one' } });
    const id = (await items(srv, admin)).items[0].id;
    await srv.call('PATCH', `/api/inbox/${id}`, { token: admin, body: { status: 'read' } });
    await srv.call('PATCH', `/api/inbox/${id}`, { token: admin, body: { status: 'resolved' } });
    const log = (await srv.call('GET', '/api/audit?entity=inbox&limit=50', { token: admin })).json.rows as any[];
    assert.ok(log.some((r) => /marked resolved/.test(r.detail)));
    assert.ok(!log.some((r) => /marked read/.test(r.detail)));
  } finally { await srv.close(); }
});

test('inbox: the administrator can delete a message; others cannot, and it is audited', async () => {
  const { srv, admin, reception, doctor } = await setup();
  try {
    await srv.call('POST', '/api/support/issue', { token: doctor, body: { subject: 'Delete me', message: 'A message to remove' } });
    const id = (await items(srv, admin)).items[0].id;
    assert.equal((await srv.call('DELETE', `/api/inbox/${id}`, { token: reception })).status, 403);
    assert.equal((await srv.call('DELETE', `/api/inbox/${id}`)).status, 401);
    assert.equal((await srv.call('DELETE', `/api/inbox/${id}`, { token: admin })).status, 200);
    assert.equal((await items(srv, admin)).items.length, 0);
    assert.equal((await srv.call('GET', '/api/inbox/summary', { token: admin })).json.new, 0);
    assert.equal((await srv.call('DELETE', `/api/inbox/${id}`, { token: admin })).status, 404);
    assert.ok((await srv.call('GET', '/api/audit?entity=inbox&limit=50', { token: admin })).text.includes('Delete me'));
  } finally { await srv.close(); }
});
