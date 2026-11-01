import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsOf, makeBrief, rulesBrief, type BriefInput } from './clinicalSummary.js';

const input: BriefInput = {
  ageYears: 54, sex: 'F',
  allergies: [{ allergen: 'Penicillin', severity: 'Severe / Anaphylaxis', reaction: 'rash' }],
  problems: [{ name: 'Type 2 diabetes', status: 'Chronic' }],
  vitals: { bpSystolic: 150, bpDiastolic: 95, heartRate: 88 },
  medicines: [{ medicine: 'Metformin 500 mg', dosage: '1 tablet', frequency: 'twice daily' }],
  labs: [{ test: 'Potassium', value: '6.9', unit: 'mmol/L', flag: 'critical' }, { test: 'HbA1c', value: '8.4', unit: '%', flag: 'abnormal' }],
  encounters: [{ date: '2026-10-01T10:00:00Z', diagnosis: 'Uncontrolled diabetes', plan: 'Review in 4 weeks' }],
  openItems: ['Referral to Ophthalmology is drafted'],
};

test('without an API key the brief is built from the chart by rules, critical values first after allergies', async () => {
  const b = await makeBrief(input, '');
  assert.equal(b.source, 'rules');
  assert.match(b.text, /Allergies: Penicillin/);
  assert.match(b.text, /Critical lab values: Potassium 6.9 mmol\/L/);
  assert.ok(b.text.indexOf('Critical') < b.text.indexOf('Abnormal'));
});

test('an empty chart says so instead of inventing a summary', () => {
  assert.equal(rulesBrief({ ageYears: 30, sex: 'M', allergies: [], problems: [], medicines: [], labs: [], encounters: [], openItems: [] }), 'Nothing in the chart yet to summarise.');
});

test('the facts sent to a model carry no name, phone or UHID', () => {
  const facts = factsOf(input);
  assert.match(facts, /54 year old/);
  assert.doesNotMatch(facts, /CW-|\+91|@/);
});
