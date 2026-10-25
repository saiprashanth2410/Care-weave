import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDuplicateTherapy, extractMolecules, dailyDoseMg } from './safety/molecules.js';

const today = new Date().toISOString();
const rx = (medicine: string, extra: any = {}) => ({ id: 'rx1', status: 'Active', date: today, medicine, dosage: '', frequency: 'Twice daily', prescribingClinician: 'Dr A', source: 'CareWeave Clinic', ...extra });

test('splits combinations and normalises synonyms and salts', () => {
  assert.deepEqual(extractMolecules('Augmentin 625 (amoxicillin + clavulanic acid) oral tablet'), ['amoxicillin', 'clavulanic acid']);
  assert.deepEqual(extractMolecules('Dolo (paracetamol / acetaminophen) 650 mg'), ['paracetamol']);
  assert.deepEqual(extractMolecules('Metformin HCl'), ['metformin']);
  assert.deepEqual(extractMolecules('Moxikind-CV 625'), ['amoxicillin', 'clavulanic acid']);
});

test('case 1: Augmentin active, Moxikind-CV is blocked on amoxicillin', async () => {
  const alerts = await checkDuplicateTherapy({
    medicine: 'Moxikind-CV 625 (amoxicillin + clavulanic acid) oral tablet',
    prescriptions: [rx('Augmentin 625 (amoxicillin + clavulanic acid) oral tablet')], externalRecords: [],
  });
  assert.equal(alerts[0].severity, 'HIGH_COLLISION');
  assert.ok(alerts[0].matchedMolecules.includes('amoxicillin'));
  assert.equal(alerts[0].conflictingDrug.source, 'IN_HOUSE_ENCOUNTER');
});

test('case 2: Calpol (paracetamol) active, Ultracet is flagged for paracetamol doubling', async () => {
  const alerts = await checkDuplicateTherapy({
    medicine: 'Ultracet (tramadol + paracetamol) 37.5 mg + 325 mg oral tablet', frequency: 'Every 6 hours',
    prescriptions: [], externalRecords: [{ kind: 'medication', patientId: 'p1', status: 'Linked', facility: 'City Lab', eventDate: today, content: { medicine: 'Calpol 500 (paracetamol)', dosage: '500 mg', frequency: 'Every 6 hours' } }],
  });
  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0].matchedMolecules, ['paracetamol']);
  assert.equal(alerts[0].conflictingDrug.source, 'EXTERNAL_RECONCILED_RECORD');
  assert.match(alerts[0].clinicalWarning, /hepatotoxicity/);
  assert.match(alerts[0].clinicalWarning, /2300 mg\/day|2650 mg\/day|\d+ mg\/day combined/);
});

test('same class without a shared molecule is only a warning; completed or old courses are ignored', async () => {
  const cls = await checkDuplicateTherapy({ medicine: 'Brufen (ibuprofen) 400 mg', prescriptions: [rx('Voveran (diclofenac) 50 mg')], externalRecords: [] });
  assert.equal(cls[0].severity, 'SAME_CLASS_WARNING');
  const none = await checkDuplicateTherapy({
    medicine: 'Dolo (paracetamol) 650 mg',
    prescriptions: [rx('Calpol (paracetamol) 500 mg', { status: 'Completed' }), rx('Crocin (paracetamol) 500 mg', { date: '2020-01-01T00:00:00Z', duration: '5 days' })], externalRecords: [],
  });
  assert.equal(none.length, 0);
});

test('daily dose multiplies strength by frequency', () => {
  assert.deepEqual(dailyDoseMg('Calpol 500 mg', ['paracetamol'], '', 'Every 8 hours'), { paracetamol: 1500 });
});
