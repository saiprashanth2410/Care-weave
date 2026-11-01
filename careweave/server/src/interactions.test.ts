import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRUG_INTERACTIONS, checkDuplicateTherapy } from './safety/molecules.js';

const today = new Date().toISOString();
const active = (medicine: string) => ({ id: 'rx1', status: 'Active', date: today, medicine, dosage: '', frequency: 'Once daily', prescribingClinician: 'Dr A', source: 'CareWeave Clinic' });
const check = (medicine: string, current: string) => checkDuplicateTherapy({ medicine, prescriptions: [active(current)], externalRecords: [] });

test('every pair in the interaction list raises an alert in both prescribing orders', async () => {
  for (const { drugA, drugB } of DRUG_INTERACTIONS) {
    for (const [now, have] of [[drugA, drugB], [drugB, drugA]]) {
      const alerts = await check(`${now} 10 mg tablet`, `${have} 10 mg tablet`);
      assert.ok(alerts.some((a) => a.severity === 'DRUG_DRUG_INTERACTION'), `${now} on top of ${have} should be flagged`);
    }
  }
});

test('warfarin and aspirin: the alert names both molecules and the patient\'s current drug', async () => {
  const [a] = (await check('Aspirin 75 mg tablet', 'Warfarin 5 mg tablet')).filter((x) => x.severity === 'DRUG_DRUG_INTERACTION');
  assert.deepEqual([...a.matchedMolecules].sort(), ['aspirin', 'warfarin']);
  assert.match(a.clinicalWarning, /Warfarin/i);
});

test('two unrelated drugs raise no interaction alert', async () => {
  const alerts = await check('Metformin 500 mg tablet', 'Amlodipine 5 mg tablet');
  assert.equal(alerts.filter((x) => x.severity === 'DRUG_DRUG_INTERACTION').length, 0);
});

test('an interaction is not reported when the other drug is stopped', async () => {
  const alerts = await checkDuplicateTherapy({ medicine: 'Aspirin 75 mg tablet', prescriptions: [{ ...active('Warfarin 5 mg tablet'), status: 'Discontinued' }], externalRecords: [] });
  assert.equal(alerts.length, 0);
});
