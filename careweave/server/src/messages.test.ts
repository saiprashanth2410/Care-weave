import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function setup() {
  const srv = await startInstance(await memoryStore());
  const reception = await srv.login('reception'), doctor = await srv.login('doctor'), lab = await srv.login('lab');
  const idOf = async (token: string) => (await srv.call('GET', '/api/me', { token })).json.id as string;
  const ids = { reception: await idOf(reception), doctor: await idOf(doctor), lab: await idOf(lab) };
  const send = (token: string, to: string, body: object) => srv.call('POST', `/api/messages/with/${to}`, { token, body });
  return { srv, reception, doctor, lab, ids, send };
}

test('messages: staff only, and the contact list never exposes credentials', async () => {
  const { srv, reception, ids } = await setup();
  try {
    assert.equal((await srv.call('GET', '/api/messages/contacts')).status, 401);
    const contacts = (await srv.call('GET', '/api/messages/contacts', { token: reception })).json as any[];
    assert.ok(contacts.length >= 3);
    assert.ok(!contacts.some((c) => c.id === ids.reception), 'not yourself');
    for (const c of contacts) assert.deepEqual(Object.keys(c).sort(), ['facility', 'id', 'name', 'role']);
    assert.ok(contacts.some((c) => c.role === 'doctor') && contacts.some((c) => c.role === 'lab'));
  } finally { await srv.close(); }
});

test('messages: a message arrives unread, shows in the conversation list, and opening the thread reads it', async () => {
  const { srv, reception, doctor, ids, send } = await setup();
  try {
    assert.equal((await send(reception, ids.doctor, { text: 'Dr, patient Meena is here for the 10 am slot' })).status, 201);
    assert.equal((await send(reception, ids.doctor, { text: 'She is a diabetic, please see her first' })).status, 201);
    assert.equal((await srv.call('GET', '/api/messages/unread', { token: doctor })).json.count, 2);
    assert.equal((await srv.call('GET', '/api/messages/unread', { token: reception })).json.count, 0);

    const list = (await srv.call('GET', '/api/messages/conversations', { token: doctor })).json as any[];
    assert.equal(list.length, 1);
    assert.equal(list[0].with.id, ids.reception);
    assert.equal(list[0].unread, 2);
    assert.match(list[0].last.text, /diabetic/);
    assert.equal(list[0].last.mine, false);

    const thread = (await srv.call('GET', `/api/messages/with/${ids.reception}`, { token: doctor })).json;
    assert.deepEqual(thread.messages.map((m: any) => m.text), ['Dr, patient Meena is here for the 10 am slot', 'She is a diabetic, please see her first']);
    assert.ok(thread.messages.every((m: any) => !m.mine));
    assert.equal((await srv.call('GET', '/api/messages/unread', { token: doctor })).json.count, 0);

    // The sender sees that it was read, and replies appear for the other side.
    await send(doctor, ids.reception, { text: 'Send her in' });
    const back = (await srv.call('GET', `/api/messages/with/${ids.doctor}`, { token: reception })).json;
    assert.deepEqual(back.messages.map((m: any) => [m.mine, m.read]), [[true, true], [true, true], [false, false]]);
  } finally { await srv.close(); }
});

test('messages: other staff cannot read a conversation they are not part of', async () => {
  const { srv, reception, lab, ids, send } = await setup();
  try {
    await send(reception, ids.doctor, { text: 'private: patient is HIV positive' });
    const peek = (await srv.call('GET', `/api/messages/with/${ids.doctor}`, { token: lab })).json;
    assert.deepEqual(peek.messages, [], 'the lab sees only its own thread with the doctor');
    assert.equal((await srv.call('GET', '/api/messages/conversations', { token: lab })).json.length, 0);
    const admin = await srv.login('admin');
    assert.equal((await srv.call('GET', '/api/messages/conversations', { token: admin })).json.length, 0, 'administrators have no view of other people\'s messages');
  } finally { await srv.close(); }
});

test('messages: validation of recipient and content', async () => {
  const { srv, reception, ids, send } = await setup();
  try {
    assert.equal((await send(reception, ids.reception, { text: 'hi me' })).status, 404);
    assert.equal((await send(reception, 'nobody', { text: 'hi' })).status, 404);
    assert.equal((await send(reception, ids.doctor, { text: '   ' })).status, 400);
    assert.equal((await send(reception, ids.doctor, { text: 'x'.repeat(2001) })).status, 413);
    assert.equal((await srv.call('GET', '/api/messages/with/nobody', { token: reception })).status, 404);
  } finally { await srv.close(); }
});

test('messages: a photo is checked, stored apart from the text, and opens only for the two people in the conversation', async () => {
  const { srv, reception, doctor, lab, ids, send } = await setup();
  try {
    const bad = [
      'data:text/html;base64,PGI+aGk8L2I+',
      'data:image/png;base64,' + Buffer.from('this is not a png at all').toString('base64'),
      'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(460_000)]).toString('base64'),
      'not a data url'
    ];
    for (const image of bad) assert.equal((await send(reception, ids.doctor, { image })).status, 400, image.slice(0, 40));

    const ok = await send(reception, ids.doctor, { image: PNG, text: 'Prescription from the other hospital' });
    assert.equal(ok.status, 201, ok.text);
    assert.ok(ok.json.imageId);
    const list = (await srv.call('GET', '/api/messages/conversations', { token: doctor })).json as any[];
    assert.ok(!JSON.stringify(list).includes('iVBOR'), 'the conversation list never carries image bytes');
    const photoOnly = await send(reception, ids.doctor, { image: PNG });
    assert.equal((await srv.call('GET', '/api/messages/conversations', { token: doctor })).json[0].last.text, '📷 Photo');

    const get = (token: string, imageId: string) => srv.call('GET', `/api/messages/image/${imageId}`, { token });
    assert.equal((await get(doctor, ok.json.imageId)).status, 200);
    assert.equal((await get(reception, photoOnly.json.imageId)).status, 200);
    assert.equal((await get(lab, ok.json.imageId)).status, 404, 'a third person cannot open it');
    assert.equal((await srv.call('GET', `/api/messages/image/${ok.json.imageId}`)).status, 401);
  } finally { await srv.close(); }
});

test('video chat: a patient can send a photo to the doctor, bad files are refused, and the transcript notes it', async () => {
  const srv = await startInstance(await memoryStore());
  try {
    const reception = await srv.login('reception'), doctor = await srv.login('doctor');
    const me = (await srv.call('GET', '/api/me', { token: doctor })).json;
    const patient = (await srv.call('POST', '/api/patients', { token: reception, body: { name: 'Photo Patient', dob: '1975-05-05', gender: 'M', phone: '+91 90000 99999' } })).json;
    await srv.call('POST', '/api/appointments', { token: reception, body: { patientId: patient.id, doctorId: me.id, date: new Date().toISOString().slice(0, 10), time: '05:00 PM', reason: 'Video' } });
    const c = (await srv.call('POST', '/api/video/consults', { token: doctor, body: { patientId: patient.id } })).json;
    const post = (body: object) => srv.call('POST', `/api/video/public/${c.id}/signal`, { body });
    assert.equal((await post({ role: 'patient', type: 'chat', data: { image: 'data:text/html;base64,PGI+' } })).status, 400);
    assert.equal((await post({ role: 'patient', type: 'chat', data: { image: 'data:image/png;base64,' + Buffer.from('fake').toString('base64') } })).status, 400);
    assert.equal((await post({ role: 'patient', type: 'chat', data: { text: 'My old prescription', image: PNG } })).status, 201);
    assert.equal((await post({ role: 'patient', type: 'caption', data: { image: PNG } })).status, 400, 'captions carry no photos');

    const got = (await srv.call('GET', `/api/video/public/${c.id}/signals?role=doctor&key=${c.doctorKey}&since=0`)).json.signals;
    assert.equal(got.length, 1);
    assert.equal(got[0].data.image, PNG);
    const t = (await srv.call('GET', `/api/video/consults/${c.id}/transcript`, { token: doctor })).json.lines;
    assert.equal(t[0].text, 'My old prescription');
    await post({ role: 'patient', type: 'chat', data: { image: PNG } });
    const t2 = (await srv.call('GET', `/api/video/consults/${c.id}/transcript`, { token: doctor })).json.lines;
    assert.equal(t2[1].text, '(shared a photo)');
  } finally { await srv.close(); }
});
