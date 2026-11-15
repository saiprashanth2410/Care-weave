import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';

const person = { name: 'Rx Patient', dob: '1975-05-05', gender: 'Female', phone: '+91 91111 22222', address: 'Chennai' };

/** A patient who is linked to the doctor and has an encounter, so prescriptions can be written. */
async function setup() {
  const srv = await startInstance(await memoryStore());
  const reception = await srv.login('reception');
  const doctor = await srv.login('doctor');
  const me = (await srv.call('GET', '/api/me', { token: doctor })).json;
  const patient = (await srv.call('POST', '/api/patients', { token: reception, body: person })).json;
  await srv.call('POST', '/api/appointments', { token: reception, body: { patientId: patient.id, doctorId: me.id, date: new Date().toISOString().slice(0, 10), time: '09:30 AM', reason: 'Visit' } });
  assert.equal((await srv.call('POST', '/api/encounters', { token: doctor, body: { patientId: patient.id, notes: 'Review' } })).status, 201);
  const batch = (medicines: object[], extra: object = {}) => srv.call('POST', '/api/prescriptions/batch', { token: doctor, body: { patientId: patient.id, medicines, ...extra } });
  const saved = async () => (await srv.repos.prescriptions.find({ patientId: patient.id })) as any[];
  return { srv, doctor, reception, patient, batch, saved };
}

const metformin = { medicine: 'Metformin HCl', dosage: '500 mg', route: 'Oral', frequency: 'Twice daily', duration: '30 days', instructions: 'With meals', refills: 1 };
const amlodipine = { medicine: 'Amlodipine Besylate', dosage: '5 mg', route: 'Oral', frequency: 'Once daily', duration: '30 days' };
const lisinopril = { medicine: 'Lisinopril', dosage: '10 mg', frequency: 'Once daily', duration: '30 days' };

test('batch: several medicines are saved together, each as its own record linked to the encounter', async () => {
  const { srv, batch, saved } = await setup();
  try {
    const r = await batch([metformin, amlodipine, lisinopril]);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.deepEqual(r.json.map((x: any) => x.medicine), ['Metformin HCl', 'Amlodipine Besylate', 'Lisinopril']);
    assert.ok(r.json.every((x: any) => x.status === 'Active' && x.encounterId && x.prescribingClinician === 'Dr. ANIRBAN LAHA'));
    assert.equal(r.json[0].refills, 1);
    assert.equal((await saved()).length, 3);
  } finally { await srv.close(); }
});

test('batch: diagnosis and notes are kept on each medicine of the prescription', async () => {
  const { srv, batch, saved } = await setup();
  try {
    const r = await batch([metformin, amlodipine], { diagnosis: 'Type 2 diabetes with hypertension', notes: 'Review in 4 weeks' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const rows = await saved();
    assert.ok(rows.every((x: any) => x.diagnosis === 'Type 2 diabetes with hypertension' && x.notes === 'Review in 4 weeks'));
  } finally { await srv.close(); }
});

test('batch: needs at least one medicine, and name, dose and frequency on each; nothing is saved on a bad row', async () => {
  const { srv, batch, saved } = await setup();
  try {
    assert.equal((await batch([])).status, 400);
    const bad = await batch([metformin, { medicine: 'Amlodipine', dosage: '5 mg' }]);
    assert.equal(bad.status, 400);
    assert.equal(bad.json.row, 1);
    assert.match(bad.json.error, /Medicine 2/);
    assert.equal((await saved()).length, 0);
  } finally { await srv.close(); }
});

test('batch: it is for the doctor\'s own patients, and the doctor must have an encounter first', async () => {
  const { srv, doctor, reception, batch } = await setup();
  try {
    assert.equal((await srv.call('POST', '/api/prescriptions/batch', { token: reception, body: { patientId: 'x', medicines: [metformin] } })).status, 403);
    assert.equal((await srv.call('POST', '/api/prescriptions/batch', { body: { patientId: 'x', medicines: [metformin] } })).status, 401);
    const stranger = (await srv.call('POST', '/api/patients', { token: reception, body: { ...person, name: 'Unlinked', phone: '+91 93333 44444' } })).json;
    assert.equal((await srv.call('POST', '/api/prescriptions/batch', { token: doctor, body: { patientId: stranger.id, medicines: [metformin] } })).status, 403);
    void batch;
  } finally { await srv.close(); }
});

test('batch: an allergy on any row blocks the whole prescription until that row is given a reason', async () => {
  const { srv, doctor, patient, batch, saved } = await setup();
  try {
    await srv.call('POST', `/api/patients/${patient.id}/allergies`, { token: doctor, body: { allergen: 'Penicillin', severity: 'Severe / Anaphylaxis' } });
    const amox = { medicine: 'Amoxicillin', dosage: '500 mg', frequency: 'Every 8 hours', duration: '5 days' };

    const blocked = await batch([metformin, amox]);
    assert.equal(blocked.status, 409);
    assert.equal(blocked.json.code, 'PRESCRIPTION_BLOCKED');
    assert.deepEqual(blocked.json.blocked.map((b: any) => [b.index, b.kind]), [[1, 'allergy']]);
    assert.equal((await saved()).length, 0, 'the other medicine was not saved either');

    assert.equal((await batch([metformin, { ...amox, allergyOverrideReason: 'short' }])).status, 409);
    const ok = await batch([metformin, { ...amox, allergyOverrideReason: 'Tolerated before under specialist supervision' }]);
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.equal(ok.json[1].allergyOverrideReason, 'Tolerated before under specialist supervision');
    assert.equal(ok.json[0].allergyOverrideReason, undefined);
  } finally { await srv.close(); }
});

test('batch: two brands of one drug in the same prescription are caught, and need an override on the second', async () => {
  const { srv, batch, saved } = await setup();
  try {
    const calpol = { medicine: 'Calpol 500 (paracetamol) oral tablet', dosage: '500 mg', frequency: 'Every 6 hours', duration: '5 days' };
    const dolo = { medicine: 'Dolo 650 (paracetamol) oral tablet', dosage: '650 mg', frequency: 'Every 6 hours', duration: '5 days' };
    const blocked = await batch([calpol, dolo]);
    assert.equal(blocked.status, 409);
    assert.deepEqual(blocked.json.blocked.map((b: any) => [b.index, b.kind]), [[1, 'duplicate']]);
    assert.ok(blocked.json.blocked[0].alerts.some((a: any) => a.severity === 'HIGH_COLLISION' && a.matchedMolecules.includes('paracetamol')));
    assert.equal((await saved()).length, 0);

    const ov = { overrideReason: 'Different strengths for day and night, reviewed', acknowledgedRisks: true };
    const ok = await batch([calpol, { ...dolo, duplicateOverride: ov }]);
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.equal(ok.json[1].duplicateOverride.reason, ov.overrideReason);
    assert.equal(ok.json[0].duplicateOverride, undefined);
  } finally { await srv.close(); }
});

test('batch: a medicine that repeats what the patient already takes is blocked, even when it is the only row', async () => {
  const { srv, batch, saved } = await setup();
  try {
    assert.equal((await batch([{ medicine: 'Calpol 500 (paracetamol) oral tablet', dosage: '500 mg', frequency: 'Every 6 hours', duration: '5 days' }])).status, 201);
    const again = await batch([{ medicine: 'Crocin 650 (paracetamol) oral tablet', dosage: '650 mg', frequency: 'Every 6 hours', duration: '5 days' }]);
    assert.equal(again.status, 409);
    assert.equal(again.json.blocked[0].kind, 'duplicate');
    assert.equal((await saved()).length, 1);
  } finally { await srv.close(); }
});

test('validate: the live check counts the other medicines being written in the same prescription', async () => {
  const { srv, doctor, patient } = await setup();
  try {
    const alone = await srv.call('POST', '/api/encounters/validate-prescription', { token: doctor, body: { patientId: patient.id, medicine: 'Dolo 650 (paracetamol) oral tablet', dosage: '650 mg', frequency: 'Every 6 hours' } });
    assert.equal(alone.json.blocking, false);
    const withOthers = await srv.call('POST', '/api/encounters/validate-prescription', {
      token: doctor,
      body: { patientId: patient.id, medicine: 'Dolo 650 (paracetamol) oral tablet', dosage: '650 mg', frequency: 'Every 6 hours', alsoPrescribing: [{ medicine: 'Calpol 500 (paracetamol) oral tablet', dosage: '500 mg', frequency: 'Every 6 hours', duration: '5 days' }] },
    });
    assert.equal(withOthers.json.blocking, true);
  } finally { await srv.close(); }
});

test('batch: the single-medicine route still works, and the audit log records each medicine', async () => {
  const { srv, doctor, patient, batch } = await setup();
  try {
    const one = await srv.call('POST', '/api/prescriptions', { token: doctor, body: { patientId: patient.id, ...lisinopril } });
    assert.equal(one.status, 201, JSON.stringify(one.json));
    assert.equal((await batch([metformin, amlodipine])).status, 201);
    const admin = await srv.login('admin');
    const log = (await srv.call('GET', '/api/audit?entity=prescription&limit=50', { token: admin })).text;
    assert.ok(log.includes('Metformin HCl') && log.includes('Amlodipine Besylate') && log.includes('2 medicine(s) in one prescription'));
  } finally { await srv.close(); }
});
