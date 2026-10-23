// End-to-end checks against a throwaway server and database (careweave_test on port 4100).
// Run: npm run test:acceptance
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import 'dotenv/config';

const PORT = 4100;
const BASE = `http://localhost:${PORT}`;
const DB = 'careweave_test';
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
let failed = 0;
let passed = 0;

function check(name: string, ok: boolean, detail = '') {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
}

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.arrayBuffer();
  let json: any = {};
  try { json = JSON.parse(Buffer.from(raw).toString()); } catch {}
  return { status: res.status, json, headers: res.headers, size: raw.byteLength };
}
const login = async (who: string) => (await call('POST', '/api/auth/login', undefined, { email: `${who}@careweave.test`, password: 'demo123' })).json.token as string;

async function main() {
  const server = spawn('npx', ['tsx', 'src/index.ts'], { env: { ...process.env, PORT: String(PORT), MONGODB_URI: URI, MONGODB_DB: DB, CLIENT_ORIGIN: 'http://localhost:5173' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); resolve(); } });
    server.on('exit', () => reject(new Error('server exited early')));
  });

  try {
    const [rec, lab, ver, doc] = await Promise.all([login('reception'), login('lab'), login('pathologist'), login('doctor')]);
    check('four role logins work', !!(rec && lab && ver && doc));

    // ---- access control ----
    check('no token -> 401', (await call('GET', '/api/lab/orders')).status === 401);
    check('receptionist cannot read lab orders', (await call('GET', '/api/lab/orders', rec)).status === 403);
    check('lab cannot list patients directory', (await call('GET', '/api/patients', lab)).status === 403);
    check('lab cannot create appointments', (await call('POST', '/api/appointments', lab, {})).status === 403);
    check('security headers set (helmet)', !!(await call('GET', '/api/health')).headers.get('x-content-type-options'));

    // ---- registration -> order linked to a real patient and encounter ----
    const today = new Date().toISOString().slice(0, 10);
    const pat = (await call('POST', '/api/patients', rec, { name: 'Accept Test', dob: '1980-05-05', phone: '+1 (415) 555-0100', email: 'accept@example.test' })).json;
    check('receptionist registers a patient', !!pat.patientId, JSON.stringify(pat).slice(0, 120));
    const appt = (await call('POST', '/api/appointments', rec, { patientId: pat.id, date: today, time: '10:00', reason: 'Check-up' })).json;
    check('receptionist books an encounter', !!appt.id, JSON.stringify(appt).slice(0, 120));

    const look = (await call('GET', `/api/lab/patients?query=${encodeURIComponent(pat.patientId)}`, lab)).json.data;
    check('lab finds the patient by ID', look?.[0]?.patientId === pat.patientId);
    check('lab lookup hides phone, email and visit reason', !JSON.stringify(look).match(/555|accept@|Check-up|dob/));
    check('lab lookup needs 2+ characters', (await call('GET', '/api/lab/patients?query=a', lab)).json.data.length === 0);

    const base = { testName: 'Lipid Profile', orderingDoctor: 'Dr. Amara Singh', patientGender: 'M', priority: 'routine' };
    check('order without a patient is rejected', (await call('POST', '/api/lab/orders', lab, base)).status === 400);
    check('order with a made-up encounter is rejected', (await call('POST', '/api/lab/orders', lab, { ...base, patientId: pat.patientId, encounterId: 'appt-fake' })).status === 400);
    const ord = (await call('POST', '/api/lab/orders', lab, { ...base, patientId: pat.patientId, encounterId: appt.id, patientName: 'IGNORED', patientAge: 3 })).json.data;
    check('order links to the registered patient and encounter', ord?.patientName === 'Accept Test' && ord?.encounterId === appt.id && ord?.patientAge > 40, JSON.stringify(ord).slice(0, 160));
    const ext = (await call('POST', '/api/lab/orders', lab, { ...base, external: true, patientName: 'Outside Person', patientAge: 50 })).json.data;
    check('external requisition allowed when marked external', ext?.external === true);

    // ---- workflow, verification permission, four-eyes ----
    const patch = (id: string, tok: string, body: unknown) => call('PATCH', `/api/lab/orders/${id}`, tok, body);
    check('cannot skip to released', (await patch(ord.id, lab, { status: 'released' })).status === 409);
    check('results before collection are rejected', (await patch(ord.id, lab, { results: [{ parameter: 'X', value: '1' }] })).status === 409);
    check('collect sample', (await patch(ord.id, lab, { status: 'collected' })).json.data?.status === 'collected');
    const rs = [{ parameter: 'TOTAL CHOLESTEROL', value: '180', unit: 'mg/dl', referenceRange: '< 200' }];
    check('submit without results is rejected', (await patch(ord.id, lab, { status: 'awaiting_verification' })).status === 400);
    check('future observation time is rejected', (await patch(ord.id, lab, { status: 'awaiting_verification', results: rs, observedAt: new Date(Date.now() + 3600e3).toISOString() })).status === 400);
    const sub = (await patch(ord.id, lab, { status: 'awaiting_verification', results: rs })).json.data;
    check('submit for verification records observation time', sub?.status === 'awaiting_verification' && !!sub?.observedAt);
    check('lab assistant cannot release (no verify permission)', (await patch(ord.id, lab, { status: 'released' })).status === 403);

    // ---- amendments ----
    const changed = [{ ...rs[0], value: '210' }];
    check('changing submitted results needs a reason', (await patch(ord.id, lab, { results: changed })).status === 400);
    const amd = (await patch(ord.id, lab, { results: changed, amendReason: 'Instrument re-run' })).json.data;
    check('amendment keeps old and new values', amd?.amendments?.[0]?.changes?.[0]?.before?.value === '180' && amd?.amendments?.[0]?.changes?.[0]?.after?.value === '210' && amd?.amendments?.[0]?.reason === 'Instrument re-run' && !!amd?.amendments?.[0]?.byName);

    // ---- four-eyes: the verifier must not be the person who entered the values ----
    const own = (await call('POST', '/api/lab/orders', lab, { ...base, external: true, patientName: 'Four Eyes', patientAge: 40 })).json.data;
    await patch(own.id, ver, { status: 'collected' });
    await patch(own.id, ver, { status: 'awaiting_verification', results: rs });
    check('entering person cannot verify own results', (await patch(own.id, ver, { status: 'released' })).status === 403);
    check('a different verifier can release', (await patch(ord.id, ver, { status: 'released' })).json.data?.status === 'released');
    const re = (await patch(ord.id, lab, { results: [{ ...rs[0], value: '190' }], amendReason: 'Typo correction' })).json.data;
    check('amending a released result forces re-verification', re?.status === 'awaiting_verification' && !re?.verifiedBy && re?.amendments?.length === 2);

    // ---- report files ----
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64').toString('base64');
    check('wrong file type rejected', (await call('POST', `/api/lab/orders/${ord.id}/attachments`, lab, { name: 'a.txt', mimeType: 'text/plain', data: 'aGk=' })).status === 400);
    check('file whose bytes do not match its type rejected', (await call('POST', `/api/lab/orders/${ord.id}/attachments`, lab, { name: 'a.pdf', mimeType: 'application/pdf', data: png })).status === 400);
    const att = (await call('POST', `/api/lab/orders/${ord.id}/attachments`, lab, { name: 'report.png', mimeType: 'image/png', data: png })).json.data?.attachments?.[0];
    check('valid report file stored with metadata', !!att?.id && att?.size > 0 && !!att?.sha256);
    const dl = await call('GET', `/api/lab/orders/${ord.id}/attachments/${att.id}`, lab);
    check('lab can download the file', dl.status === 200 && dl.size > 0);
    check('receptionist cannot download it', (await call('GET', `/api/lab/orders/${ord.id}/attachments/${att.id}`, rec)).status === 403);
    check('no token cannot download it', (await call('GET', `/api/lab/orders/${ord.id}/attachments/${att.id}`)).status === 401);

    // ---- audit + rate limit ----
    const log = await mongoose.connection.db!.collection('auditLogs').find({ entity: 'labOrder' }).toArray();
    check('amendments, status changes and downloads are in the audit log', ['amend', 'status:released', 'download', 'attach'].every((a) => log.some((l) => l.action === a)));
    let limited = 0;
    for (let i = 0; i < 14; i++) if ((await call('POST', '/api/auth/login', undefined, { email: 'reception@careweave.test', password: 'wrong' })).status === 429) limited++;
    check('repeated bad logins are rate limited', limited > 0);
  } finally {
    server.kill();
  }
}

await mongoose.connect(URI, { dbName: DB });
try {
  await main();
} catch (e) {
  failed++;
  console.log('ERROR', (e as Error).message);
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
console.log(`\n${passed} passed, ${failed} failed (test database dropped)`);
process.exit(failed ? 1 : 0);
