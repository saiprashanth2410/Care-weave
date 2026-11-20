import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { metaNumber, sendViaMeta } from './whatsapp/meta.js';

const realFetch = globalThis.fetch;
const env = { ...process.env };
let calls: { url: string; init: any }[] = [];

beforeEach(() => {
  calls = [];
  process.env.META_WHATSAPP_TOKEN = 'secret-token';
  process.env.META_PHONE_NUMBER_ID = '12345';
  delete process.env.DEFAULT_COUNTRY_CODE;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

const mockFetch = (status: number, body: unknown) => {
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
};

describe('Meta WhatsApp direct sender', () => {
  it('formats numbers the way Meta wants them', () => {
    assert.equal(metaNumber('98765 43210'), '919876543210');
    assert.equal(metaNumber('+91 98765-43210'), '919876543210');
    assert.equal(metaNumber('whatsapp:+14155238886'), '14155238886');
    assert.equal(metaNumber('12345'), null);
    assert.equal(metaNumber(undefined), null);
  });

  it('posts a text message with the bearer token and the right body', async () => {
    mockFetch(200, { messages: [{ id: 'wamid' }] });
    const r = await sendViaMeta('9876543210', 'Your token is *A-003*');
    assert.equal(r.ok, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /graph\.facebook\.com\/v\d+\.\d+\/12345\/messages$/);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
    assert.deepEqual(JSON.parse(calls[0].init.body), { messaging_product: 'whatsapp', to: '919876543210', type: 'text', text: { body: 'Your token is *A-003*' } });
  });

  it('does nothing without credentials, a usable number or a message', async () => {
    mockFetch(200, {});
    delete process.env.META_WHATSAPP_TOKEN;
    assert.equal((await sendViaMeta('9876543210', 'hi')).skipped, true);
    process.env.META_WHATSAPP_TOKEN = 'secret-token';
    assert.equal((await sendViaMeta('123', 'hi')).skipped, true);
    assert.equal((await sendViaMeta('9876543210', '')).skipped, true);
    assert.equal(calls.length, 0);
  });

  it('explains the 24-hour window and never leaks the token', async () => {
    mockFetch(400, { error: { code: 131047, message: 'Re-engagement message' } });
    const r = await sendViaMeta('9876543210', 'hi');
    assert.equal(r.ok, false);
    assert.match(r.error!, /24 hours/);
    assert.ok(!JSON.stringify(r).includes('secret-token'));
  });

  it('turns a network failure into a result instead of throwing', async () => {
    globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    const r = await sendViaMeta('9876543210', 'hi');
    assert.deepEqual(r, { ok: false, error: 'offline' });
  });
});
