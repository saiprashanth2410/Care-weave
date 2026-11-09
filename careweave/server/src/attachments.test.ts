import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';

const PDF = Buffer.from('%PDF-1.4\nfake report body\n%%EOF');

test('an attachment uploaded through one instance is served by another, from the shared store and not from disk', async () => {
  const store = await memoryStore();
  const a = await startInstance(store);
  const b = await startInstance(store);
  try {
    const labA = await a.login('lab');
    const order = (await a.call('POST', '/api/lab/orders', { token: labA, body: { testName: 'CBC', orderingDoctor: 'Dr Test', patientGender: 'F', external: true, patientName: 'Ext Patient', patientAge: 30 } })).json.data;
    assert.ok(order?.id, 'order created');
    const up = await a.call('POST', `/api/lab/orders/${order.id}/attachments`, { token: labA, body: { mimeType: 'application/pdf', name: 'report.pdf', data: PDF.toString('base64') } });
    assert.equal(up.status, 201, JSON.stringify(up.json));
    const att = up.json.data.attachments[0];
    assert.equal(att.size, PDF.length);

    assert.deepEqual(await store.files.get(att.id), PDF, 'the bytes are in the store');
    const res = await fetch(`${b.url}/api/lab/orders/${order.id}/attachments/${att.id}`, { headers: { authorization: `Bearer ${await b.login('lab')}` } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF);
  } finally {
    await a.close(); await b.close();
  }
});

test('a rejected attachment (wrong content) leaves no file behind, and a stale upload removes its file', async () => {
  const store = await memoryStore();
  const s = await startInstance(store);
  try {
    const lab = await s.login('lab');
    const order = (await s.call('POST', '/api/lab/orders', { token: lab, body: { testName: 'CBC', orderingDoctor: 'Dr Test', patientGender: 'F', external: true, patientName: 'Ext Patient', patientAge: 30 } })).json.data;
    const bad = await s.call('POST', `/api/lab/orders/${order.id}/attachments`, { token: lab, body: { mimeType: 'application/pdf', data: Buffer.from('not a pdf').toString('base64') } });
    assert.equal(bad.status, 400);
    const stale = await s.call('POST', `/api/lab/orders/${order.id}/attachments`, { token: lab, body: { mimeType: 'application/pdf', data: PDF.toString('base64'), version: order.version + 5 } });
    assert.equal(stale.status, 409);
    assert.equal((store as any).memFiles.size, 0, 'no orphaned file');
  } finally {
    await s.close();
  }
});

test('MongoDB file store round-trips binary data exactly (runs when a local mongod is reachable)', async (t) => {
  const mongoose = (await import('mongoose')).default;
  const { openMongoStore } = await import('./repo/index.js');
  const { TEST_MONGODB_URI } = await import('./testing.js');
  const probe = await mongoose.createConnection(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 1500 }).asPromise().catch(() => null);
  if (!probe) return t.skip('no mongod reachable');
  await probe.close();
  const store = await openMongoStore(TEST_MONGODB_URI, `careweave_files_${process.pid}`, () => {});
  try {
    const bytes = Buffer.from(Array.from({ length: 3 * 1024 * 1024 }, (_, i) => (i * 7) % 256)); // 3 MB, every byte value
    await store.files.put('f1', bytes);
    assert.deepEqual(await store.files.get('f1'), bytes);
    await store.files.put('f1', PDF);
    assert.deepEqual(await store.files.get('f1'), PDF, 'replacing keeps one copy');
    await store.files.delete('f1');
    assert.equal(await store.files.get('f1'), null);
  } finally {
    await mongoose.connection.db!.dropDatabase(); // the database created above, by its exact name
    await store.close();
  }
});

test('a file the virus scan flags is refused and not stored; an unreachable scanner refuses uploads', async () => {
  const store = await memoryStore();
  const s = await startInstance(store);
  const lab = await s.login('lab');
  const order = (await s.call('POST', '/api/lab/orders', { token: lab, body: { testName: 'CBC', orderingDoctor: 'Dr Test', patientGender: 'F', external: true, patientName: 'Ext Patient', patientAge: 30 } })).json.data;
  const upload = (body: Buffer) => s.call('POST', `/api/lab/orders/${order.id}/attachments`, { token: lab, body: { mimeType: 'application/pdf', name: 'r.pdf', data: body.toString('base64') } });
  try {
    const eicar = Buffer.from('%PDF-1.4\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n%%EOF');
    assert.equal((await upload(eicar)).status, 422);
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '1'; // nothing listens here
    assert.equal((await upload(PDF)).status, 503);
    delete process.env.CLAMAV_HOST; delete process.env.CLAMAV_PORT;
    assert.equal((await upload(PDF)).status, 201);
  } finally {
    delete process.env.CLAMAV_HOST; delete process.env.CLAMAV_PORT;
    await s.close();
  }
});

test('with ATTACHMENT_KEY the stored bytes are encrypted, the download is the original, and a wrong key cannot read them', async () => {
  const { seal, open } = await import('./attachmentSecurity.js');
  const key = Buffer.alloc(32, 7);
  const sealed = seal(PDF, key);
  assert.notDeepEqual(sealed, PDF);
  assert.ok(!sealed.includes('fake report body'));
  assert.deepEqual(open(sealed, key), PDF);
  assert.throws(() => open(sealed, Buffer.alloc(32, 9)));
  assert.deepEqual(open(PDF, key), PDF, 'a file saved before encryption was switched on still opens');

  process.env.ATTACHMENT_KEY = key.toString('hex');
  const store = await memoryStore();
  const s = await startInstance(store);
  try {
    const lab = await s.login('lab');
    const order = (await s.call('POST', '/api/lab/orders', { token: lab, body: { testName: 'CBC', orderingDoctor: 'Dr Test', patientGender: 'F', external: true, patientName: 'Ext Patient', patientAge: 30 } })).json.data;
    const att = (await s.call('POST', `/api/lab/orders/${order.id}/attachments`, { token: lab, body: { mimeType: 'application/pdf', name: 'r.pdf', data: PDF.toString('base64') } })).json.data.attachments[0];
    assert.ok(!(await store.files.get(att.id))!.includes('fake report body'), 'the store holds ciphertext');
    const res = await fetch(`${s.url}/api/lab/orders/${order.id}/attachments/${att.id}`, { headers: { authorization: `Bearer ${lab}` } });
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF);
  } finally {
    delete process.env.ATTACHMENT_KEY;
    await s.close();
  }
});
