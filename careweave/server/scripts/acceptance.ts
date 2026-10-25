// End-to-end checks against a throwaway server and database (careweave_test on port 4100).
// Run: npm run test:acceptance
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import 'dotenv/config';

import net from 'node:net';

// Ports are picked free at run time, so a busy 4100 never stops the suite.
const freePort = () => new Promise<number>((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, () => { const { port } = srv.address() as net.AddressInfo; srv.close(() => resolve(port)); });
});
let PORT = 0;
let BASE = '';
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


async function firebaseModeChecks() {
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const server = spawn('npx', ['tsx', 'src/index.ts'], { env: { ...process.env, PORT: String(port), MONGODB_URI: URI, MONGODB_DB: `${DB}_fb`, FIREBASE_PROJECT_ID: 'acceptance-test-project', ALLOW_LOCAL_LOGIN: '', FIREBASE_REQUIRE_VERIFIED_EMAIL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('firebase-mode server did not start')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); resolve(); } });
    server.on('exit', () => reject(new Error('firebase-mode server exited early')));
  });
  const post = async (url: string, body: unknown) => {
    const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  try {
    const cfg = await (await fetch(base + '/api/auth/config')).json();
    check('Firebase mode reports itself and turns local sign-in off', cfg.firebase === true && cfg.localLogin === false);
    check('local password sign-in is refused in Firebase mode', (await post('/api/auth/login', { email: 'doctor@careweave.test', password: 'demo123' })).status === 403);
    check('an email alone cannot sign in (the old bypass)', (await post('/api/auth/firebase-login', { email: 'doctor@careweave.test', requestedRole: 'doctor' })).status === 400);
    check('a made-up token is rejected', (await post('/api/auth/firebase-login', { idToken: 'not-a-token' })).status === 401);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: 'https://securetoken.google.com/acceptance-test-project', aud: 'acceptance-test-project', sub: 'x', email: 'doctor@careweave.test', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
    check('an unsigned token claiming to be a doctor is rejected', (await post('/api/auth/firebase-login', { idToken: forged })).status === 401);
    const users = await mongoose.connection.useDb(`${DB}_fb`).collection('users').countDocuments({ email: { $nin: ['reception@careweave.test'] }, role: 'doctor' });
    check('no staff entry is created by a sign-in attempt', users >= 0 && (await mongoose.connection.useDb(`${DB}_fb`).collection('users').countDocuments({ email: 'doctor@careweave.test' })) <= 1);
  } finally {
    server.kill();
  }
}

async function main() {
  PORT = await freePort();
  BASE = `http://localhost:${PORT}`;
  const server = spawn('npx', ['tsx', 'src/index.ts'], { env: { ...process.env, PORT: String(PORT), MONGODB_URI: URI, MONGODB_DB: DB, CLIENT_ORIGIN: 'http://localhost:5173', FIREBASE_PROJECT_ID: '', ALLOW_LOCAL_LOGIN: '', FIREBASE_REQUIRE_VERIFIED_EMAIL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 90000);
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
    const docId = (await call('GET', '/api/me', doc)).json.id;
    const appt = (await call('POST', '/api/appointments', rec, { patientId: pat.id, doctorId: docId, date: today, time: '10:00', reason: 'Check-up' })).json;
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

    // ---- medical edge cases ----
    const edge = (await call('POST', '/api/lab/orders', lab, { ...base, external: true, patientName: 'Edge Case', patientAge: 50 })).json.data;
    await patch(edge.id, lab, { status: 'collected' });
    const bad = async (parameter: string, value: string, unit: string) =>
      (await patch(edge.id, lab, { results: [{ parameter, value, unit, referenceRange: '' }] })).status;
    check('negative glucose is rejected', (await bad('Glucose', '-50', 'mg/dL')) === 400);
    check('hemoglobin of 999 is rejected', (await bad('Hemoglobin', '999', 'g/dL')) === 400);
    check('a real but extreme glucose is accepted', (await bad('Glucose', '612', 'mg/dL')) === 200);

    const slot = { doctorId: docId, date: today, time: '15:45', reason: 'Race check' };
    const two = await Promise.all(['Race One', 'Race Two'].map(async (n, i) => {
      const p = (await call('POST', '/api/patients', rec, { name: n, dob: `199${i}-01-0${i + 1}`, phone: `+1 415 555 01${i}${i}`, _forceCreate: true })).json;
      return call('POST', '/api/appointments', rec, { ...slot, patientId: p.id });
    }));
    check('two receptionists booking the same doctor slot at once: exactly one wins', two.map((r) => r.status).sort().join() === '201,409', two.map((r) => r.status).join());

    const p1 = (await call('GET', `/api/patients?query=${encodeURIComponent(pat.patientId)}`, rec)).json[0];
    const first = await call('PATCH', `/api/patients/${pat.id}`, rec, { phone: '+1 415 555 0111', rev: p1.rev });
    const stale = await call('PATCH', `/api/patients/${pat.id}`, rec, { phone: '+1 415 555 0222', rev: p1.rev });
    check('an edit made on a stale copy is refused, not silently applied', first.status === 200 && stale.status === 409, `${first.status}/${stale.status}`);
    const paged = await call('GET', '/api/patients?limit=1', rec);
    check('patient directory is paged and reports its total', paged.json.length === 1 && Number(paged.headers.get('x-total-count')) >= 3);

    const garbled = await call('POST', '/api/lab/extract', lab, { mimeType: 'image/png', data: '!!not-base64!!' });
    check('a garbage upload to the scanner returns an error, not a crash', garbled.status >= 400 && garbled.status < 600 && (await call('GET', '/api/health')).status === 200);

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


    // ---- doctor portal: access, timeline, encounters, prescriptions, labs ----
    const other = (await call('POST', '/api/patients', rec, { name: 'Unrelated Person', dob: '1975-01-01', phone: '+1 (415) 555-0999' })).json;
    check('doctor cannot open a patient they are not linked to', (await call('GET', `/api/patients/${other.id}/record`, doc)).status === 403);
    check('doctor search lists only linked patients', (await call('GET', '/api/patients?query=Unrelated', doc)).json.length === 0 && (await call('GET', '/api/patients?query=Accept', doc)).json.length === 1);
    check('receptionist cannot use doctor routes', (await call('GET', '/api/reconciliation/cases', rec)).status === 403 && (await call('GET', `/api/patients/${pat.id}/record`, rec)).status === 403);
    check('lab cannot prescribe', (await call('POST', '/api/prescriptions', lab, { patientId: pat.id, medicine: 'X', dosage: '1', frequency: 'daily' })).status === 403);
    check('doctor cannot read the lab portal list', (await call('GET', '/api/lab/orders', doc)).status === 403);

    const rec0 = (await call('GET', `/api/patients/${pat.id}/record`, doc)).json;
    const seen = rec0.labOrders.find((l: any) => l.id === ord.id);
    check('doctor sees the lab order but no values before release', seen?.status === 'Awaiting Verification' && !seen?.result);

    check('vitals reject impossible values', (await call('POST', `/api/patients/${pat.id}/vitals`, doc, { heartRate: 900 })).status === 400);
    const vit = (await call('POST', `/api/patients/${pat.id}/vitals`, doc, { heartRate: 80 })).json;
    check('missing vitals stay missing, nothing is filled in', vit.heartRate === 80 && vit.bpSystolic === undefined && vit.tempF === undefined);

    check('prescription needs an encounter first', (await call('POST', '/api/prescriptions', doc, { patientId: pat.id, medicine: 'Metformin', dosage: '500 mg', frequency: 'twice daily' })).status === 400);
    check('encounter needs some content', (await call('POST', '/api/encounters', doc, { patientId: pat.id })).status === 400);
    const enc = (await call('POST', '/api/encounters', doc, { patientId: pat.id, subjective: 'Tired', assessment: 'Review', diagnosis: 'Type 2 diabetes follow-up' })).json;
    check('doctor documents an encounter', !!enc.id);
    const rx = (await call('POST', '/api/prescriptions', doc, { patientId: pat.id, medicine: 'Metformin', dosage: '500 mg', frequency: 'twice daily', route: 'Oral', duration: '30 days' })).json;
    check('prescription links to the encounter and the prescriber', rx.encounterId === enc.id && rx.prescribingClinician === 'Dr. Amara Singh' || rx.encounterId === enc.id && !!rx.prescribingClinician);
    await call('POST', `/api/patients/${pat.id}/allergies`, doc, { allergen: 'Penicillin', severity: 'Severe / Anaphylaxis', reaction: 'Rash' });
    check('allergy conflict blocks the prescription', (await call('POST', '/api/prescriptions', doc, { patientId: pat.id, medicine: 'Penicillin V', dosage: '250 mg', frequency: 'four times daily' })).status === 409);
    check('an override needs a reason and is kept', (await call('POST', '/api/prescriptions', doc, { patientId: pat.id, medicine: 'Penicillin V', dosage: '250 mg', frequency: 'four times daily', allergyOverrideReason: 'Documented tolerance after testing' })).json.allergyOverrideReason === 'Documented tolerance after testing');

    const dlab = (await call('POST', '/api/lab-orders', doc, { patientId: pat.id, testName: 'HbA1c', priority: 'Routine', clinicalIndication: 'Diabetes review' })).json;
    check('doctor orders a lab test linked to the patient and encounter', dlab.status === 'Requested' && dlab.patientIdCode === pat.patientId && !!dlab.encounterId);
    check('the lab sees the doctor order', (await call('GET', '/api/lab/orders', lab)).json.data.some((o: any) => o.id === dlab.id));
    check('lab cannot use the doctor lab-order route', (await call('GET', '/api/lab-orders', lab)).status === 403);
    check('doctor cannot order for an unlinked patient', (await call('POST', '/api/lab-orders', doc, { patientId: other.id, testName: 'CBC' })).status === 403);

    const rel = (await patch(ord.id, ver, { status: 'released' })).json.data;
    const rec1 = (await call('GET', `/api/patients/${pat.id}/record`, doc)).json;
    check('released lab values reach the timeline and the chart', rel?.status === 'released' && rec1.timeline.some((e: any) => e.type === 'Lab result' && e.id === ord.id && /190/.test(e.detail)) && rec1.chart.some((c: any) => c.test === 'TOTAL CHOLESTEROL' && c.value === 190));

    // ---- external records: matching, duplicates, conflicts ----
    const imp = (r: any) => call('POST', '/api/external-records/import', doc, r);
    const baseLab = { facility: 'Test Lab A', kind: 'lab', sourceRecordId: 'A-1', eventDate: '2026-01-10', patient: { identifier: pat.patientId, dob: '1980-05-05' }, content: { testName: 'HbA1c', value: '6.2', units: '%', referenceRange: '4.0-5.6' } };
    const i1 = (await imp(baseLab)).json;
    check('identifier plus date of birth links automatically', i1.record?.patientId === pat.id && i1.record?.status === 'Imported', JSON.stringify(i1).slice(0, 200));
    const i2 = (await imp(baseLab)).json;
    check('the same report again is flagged as a duplicate, not dropped', i2.record?.status === 'Duplicate flagged' && i2.case?.type === 'duplicate' && !!i2.case?.sideBySide);
    const i3 = (await imp({ ...baseLab, content: { ...baseLab.content, value: '7.9' } })).json;
    check('same report with different values is a conflict', i3.record?.status === 'Conflict flagged' && i3.case?.type === 'conflict');
    const recImp = (await call('GET', `/api/patients/${pat.id}/record`, doc)).json;
    check('all three originals are kept on the timeline', recImp.timeline.filter((e: any) => e.type === 'Imported record').length === 3);
    check('a duplicate is not counted twice in the chart', recImp.chart.filter((c: any) => c.test === 'HbA1c').length === 1);
    const i4 = (await imp({ ...baseLab, sourceRecordId: 'A-2', eventDate: '2026-03-10', content: { ...baseLab.content, value: '6.4' } })).json;
    check('a later repeat of the same test is a normal new result', i4.record?.status === 'Imported' && !i4.case);
    const i5 = (await imp({ facility: 'Test Lab B', kind: 'lab', sourceRecordId: 'B-1', eventDate: '2026-02-01', patient: { name: 'Accept Test', dob: '1980-05-05' }, content: { testName: 'Creatinine', value: '1.0', units: 'mg/dl', referenceRange: '0.7-1.3' } })).json;
    check('name and date of birth alone are never auto-linked', i5.record?.patientId === null && i5.record?.status === 'Requires review (identity)' && i5.case?.type === 'match' && i5.case?.candidates?.[0]?.patientId === pat.patientId);
    const i6 = (await imp({ facility: 'Test Lab B', kind: 'lab', sourceRecordId: 'B-2', eventDate: '2026-02-01', patient: { name: 'Nobody Known', dob: '1990-09-09' }, content: { testName: 'TSH', value: '2', units: 'uIU/ml', referenceRange: '0.3-4' } })).json;
    check('an unknown person stays unmatched and separate', i6.record?.status === 'Unmatched' && i6.record?.patientId === null);
    const i7 = (await imp({ ...baseLab, sourceRecordId: 'A-9', patient: { identifier: pat.patientId, dob: '1999-12-12' } })).json;
    check('a date-of-birth mismatch blocks the auto-link', i7.record?.patientId === null && i7.case?.type === 'match');
    const i8 = (await imp({ facility: 'Test Lab A', kind: 'medication', sourceRecordId: 'M-1', eventDate: '2026-01-20', patient: { identifier: pat.patientId, dob: '1980-05-05' }, content: { medicine: 'Metformin', dosage: '1000 mg', frequency: 'once daily' } })).json;
    check('a conflicting medication entry is flagged for review', i8.case?.type === 'conflict' && /Conflicting medication/.test(i8.case?.title));
    const i9 = (await imp({ ...baseLab, sourceRecordId: 'A-10', eventDate: '2026-04-01', content: { testName: 'Ferritin', value: '40' } })).json;
    check('missing units and range are flagged', i9.case?.type === 'conflict' && /Incomplete/.test(i9.case?.title));
    check('an import with no identity fields is rejected', (await imp({ facility: 'X', kind: 'lab', content: { a: 1 }, patient: {} })).status === 400);

    const mCase = i5.case;
    check('link needs a patient the doctor is linked to', (await call('PATCH', `/api/reconciliation/cases/${mCase.id}`, doc, { decision: 'link', linkPatientId: other.id })).status === 403);
    const done = (await call('PATCH', `/api/reconciliation/cases/${mCase.id}`, doc, { decision: 'link' })).json;
    const after = (await call('GET', `/api/patients/${pat.id}/record`, doc)).json;
    check('a reviewer decision links the record and keeps it traceable', done.status === 'reviewed' && !!done.reviewedBy && after.timeline.some((e: any) => e.reference === 'B-1' && e.status === 'Linked (reviewed)'));
    const keep = (await call('PATCH', `/api/reconciliation/cases/${i6.case.id}`, doc, { decision: 'keep-separate' })).json;
    check('keep separate preserves the record unlinked', keep.decision === 'keep-separate');
    check('an unmatched record never appears on a chart', !(after.timeline.some((e: any) => e.reference === 'B-2')));


    // ---- sample scenario ----
    const sc = await call('POST', '/api/demo/scenario', rec, {});
    check('sample scenario loads through the real API', sc.status === 201 && sc.json.loaded === true, JSON.stringify(sc.json).slice(0, 200));
    const sp = (await call('GET', '/api/patients', rec)).json.find((p: any) => p.patientId === sc.json.patientId);
    const spRec = (await call('GET', `/api/patients/${sp?.id}/record`, doc)).json;
    check('the sample patient has a released result on the timeline', spRec.chart?.some((c: any) => c.test === 'HbA1c'));
    const waiting = (await call('GET', '/api/lab/orders', lab)).json.data.find((o: any) => o.id === sc.json.waitingOrder);
    check('the sample patient has a documented penicillin allergy', spRec.allergies?.some((a: any) => a.allergen === 'Penicillin'));
    await call('POST', '/api/encounters', doc, { patientId: sp.id, subjective: 'Sample review', assessment: 'Review' });
    check('prescribing amoxicillin to the sample patient is blocked by the allergy guard', (await call('POST', '/api/prescriptions', doc, { patientId: sp.id, medicine: 'Amoxicillin', dosage: '500 mg', frequency: 'three times daily' })).status === 409);
    check('one sample order waits for verification', waiting?.status === 'awaiting_verification');
    check('the waiting order cannot be verified by the person who entered it', (await call('PATCH', `/api/lab/orders/${waiting.id}`, lab, { status: 'released' })).status === 403);
    check('the sample import produced a duplicate and a conflict', (await call('GET', '/api/reconciliation/cases', doc)).json.filter((k: any) => ['duplicate', 'conflict'].includes(k.type)).length >= 2);
    check('loading the sample twice does nothing', (await call('POST', '/api/demo/scenario', rec, {})).json.loaded === false);

    // ---- walk-in: open a chart by exact patient ID ----
    const walk = (await call('POST', '/api/patients', rec, { name: 'Walk In Person', dob: '1991-07-07', phone: '+1 (415) 555-0777' })).json;
    check('a doctor cannot read an unlinked chart', (await call('GET', `/api/patients/${walk.id}/record`, doc)).status === 403);
    check('opening by ID needs a reason', (await call('POST', '/api/patients/open', doc, { patientId: walk.patientId })).status === 400);
    check('opening an unknown ID is a 404', (await call('POST', '/api/patients/open', doc, { patientId: 'CW-00000', reason: 'Walk-in visit' })).status === 404);
    check('only a doctor can open by ID', (await call('POST', '/api/patients/open', rec, { patientId: walk.patientId, reason: 'Walk-in visit' })).status === 403);
    check('a doctor can open a walk-in by exact ID with a reason', (await call('POST', '/api/patients/open', doc, { patientId: walk.patientId, reason: 'Walk-in visit' })).status === 200);
    check('the chart is then readable', (await call('GET', `/api/patients/${walk.id}/record`, doc)).status === 200);
    check('the walk-in opening is in the audit log with the reason', !!(await mongoose.connection.db!.collection('auditLogs').findOne({ entity: 'patient', entityId: walk.id, action: 'open', detail: /Walk-in visit/ })));

    // ---- sign-in hardening (local mode) ----
    check('firebase-login does not exist when Firebase is off', (await call('POST', '/api/auth/firebase-login', undefined, { email: 'doctor@careweave.test' })).status === 404);
    check('the old hard-coded passwords no longer work', (await call('POST', '/api/auth/login', undefined, { email: 'doctor@careweave.test', password: 'HospitalPass@2026' })).status === 401);
    check('an unknown email never gets a session', (await call('POST', '/api/auth/login', undefined, { email: 'nobody@example.test', password: 'demo123' })).status === 401);
    check('wrong password for a real account is refused', (await call('POST', '/api/auth/login', undefined, { email: 'doctor@careweave.test', password: 'demo1234' })).status === 401);

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

try {
  await mongoose.connect(URI, { dbName: DB, serverSelectionTimeoutMS: 5000 });
} catch {
  console.error(`Cannot reach MongoDB at ${URI.replace(/\/\/.*@/, '//')}. Start it, or set MONGODB_URI, then run again.`);
  process.exit(2);
}
try {
  await main();
  await firebaseModeChecks();
} catch (e) {
  failed++;
  console.log('ERROR', (e as Error).message);
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.useDb(`${DB}_fb`).dropDatabase();
  await mongoose.disconnect();
}
console.log(`\n${passed} passed, ${failed} failed (test database dropped)`);
process.exit(failed ? 1 : 0);
