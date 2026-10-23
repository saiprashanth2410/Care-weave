import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { extractWithGemini } from './geminiScan.js';
import { ScanError } from './scanSchema.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const reply = (text: string, status = 200) => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ text }] }] }), { status })) as typeof fetch;
};

const fails = async (status: number) => {
  await assert.rejects(extractWithGemini('image/png', 'AAAA', 'k'), (e: unknown) => e instanceof ScanError && e.status === status);
};

test('gibberish from the model is a clean 422, not a crash', async () => {
  reply('Sorry, I cannot help with that image <<<>>>');
  await fails(422);
});

test('JSON of the wrong shape is a clean 422 or an empty draft, never a crash', async () => {
  reply('"just a string"');
  const out = await extractWithGemini('image/png', 'AAAA', 'k');
  assert.equal(out.results.length, 0);
  assert.ok(out.warnings.length > 0);
});

test('fenced JSON with missing and mistyped fields is repaired, not trusted', async () => {
  reply('```json\n{"patientName":"Ravi","patientAge":"45","patientGender":"male","results":[{"parameter":"LDL","value":165,"flag":"HIGH"},null,"x"]}\n```');
  const out = await extractWithGemini('image/png', 'AAAA', 'k');
  assert.equal(out.patientName, 'Ravi');
  assert.equal(out.patientAge, 45);
  assert.equal(out.patientGender, 'O');
  assert.equal(out.results[0].value, '165');
  assert.equal(out.results[0].flag, 'normal');
});

test('the free-tier limit is reported as 429', async () => {
  globalThis.fetch = (async () => new Response('{}', { status: 429, headers: { 'retry-after': '7200' } })) as typeof fetch;
  await fails(429);
});

test('a rejected file is a 422', async () => {
  reply('', 400);
  await fails(422);
});
