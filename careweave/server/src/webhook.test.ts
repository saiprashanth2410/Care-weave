import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validMetaSignature } from './whatsapp/routes.js';
import { memoryStore, startInstance } from './testing.js';

const SECRET = 'test-app-secret';
const sign = (body: string, secret = SECRET) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
const metaBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ from: '919876543210', text: { body: 'HELP' } }] } }] }] });
const post = (s: Awaited<ReturnType<typeof startInstance>>, body: string, headers: Record<string, string> = {}) =>
  s.call('POST', '/api/whatsapp/inbound', { raw: body, headers: { 'content-type': 'application/json', ...headers } });

const saved = { secret: process.env.META_APP_SECRET, env: process.env.NODE_ENV, key: process.env.WHATSAPP_API_KEY };
beforeEach(() => { process.env.META_APP_SECRET = SECRET; delete process.env.WHATSAPP_API_KEY; });
afterEach(() => {
  for (const [k, v] of [['META_APP_SECRET', saved.secret], ['NODE_ENV', saved.env], ['WHATSAPP_API_KEY', saved.key]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test('validMetaSignature accepts the exact HMAC and nothing else', () => {
  const raw = Buffer.from(metaBody);
  assert.equal(validMetaSignature(raw, sign(metaBody), SECRET), true);
  assert.equal(validMetaSignature(raw, sign(metaBody, 'other-secret'), SECRET), false);
  assert.equal(validMetaSignature(raw, sign(metaBody + ' '), SECRET), false);
  assert.equal(validMetaSignature(raw, undefined, SECRET), false);
  assert.equal(validMetaSignature(raw, 'sha256=', SECRET), false);
  assert.equal(validMetaSignature(raw, 'sha256=zz', SECRET), false);
  assert.equal(validMetaSignature(raw, sign(metaBody).replace('sha256=', ''), SECRET), false);
});

test('webhook: a valid signature is accepted', async () => {
  const s = await startInstance(await memoryStore());
  try {
    const r = await post(s, metaBody, { 'x-hub-signature-256': sign(metaBody) });
    assert.equal(r.status, 200);
  } finally { await s.close(); }
});

test('webhook: a signature made with the wrong secret, or over a different body, is rejected with 401', async () => {
  const s = await startInstance(await memoryStore());
  try {
    assert.equal((await post(s, metaBody, { 'x-hub-signature-256': sign(metaBody, 'wrong') })).status, 401);
    assert.equal((await post(s, metaBody, { 'x-hub-signature-256': sign('{"tampered":true}') })).status, 401);
    assert.equal((await post(s, metaBody, { 'x-hub-signature-256': 'sha256=not-hex' })).status, 401);
  } finally { await s.close(); }
});

test('webhook: a Meta-shaped call with no signature header is rejected with 401', async () => {
  const s = await startInstance(await memoryStore());
  try {
    const r = await post(s, metaBody);
    assert.equal(r.status, 401);
  } finally { await s.close(); }
});

test('webhook: with no META_APP_SECRET, production refuses the call and development allows it', async () => {
  delete process.env.META_APP_SECRET;
  const s = await startInstance(await memoryStore());
  try {
    process.env.NODE_ENV = 'production';
    assert.equal((await post(s, metaBody, { 'x-hub-signature-256': sign(metaBody) })).status, 503);
    process.env.NODE_ENV = 'development';
    assert.equal((await post(s, metaBody)).status, 200);
  } finally { await s.close(); }
});

test('webhook: n8n and Twilio calls (no Meta signature) still need the shared key when one is set', async () => {
  const s = await startInstance(await memoryStore());
  try {
    process.env.WHATSAPP_API_KEY = 'shared-key';
    const body = JSON.stringify({ from: '919876543210', message: 'HELP' });
    assert.equal((await post(s, body)).status, 401);
    const ok = await post(s, body, { 'x-api-key': 'shared-key' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.command, 'HELP');
  } finally { await s.close(); }
});
