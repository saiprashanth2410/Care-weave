import { test } from 'node:test';
import assert from 'node:assert/strict';
import { implausibleValue } from './labRules.js';

test('rejects impossible values', () => {
  assert.match(implausibleValue('Glucose', '-50', 'mg/dL'), /negative/);
  assert.match(implausibleValue('Hemoglobin', '999', 'g/dL'), /not a possible value/);
  assert.match(implausibleValue('HbA1c', '90', '%'), /not a possible value/);
  assert.match(implausibleValue('Potassium', '55', 'mmol/L'), /not a possible value/);
  assert.match(implausibleValue('Neutrophils', '140', '%'), /above 100%/);
});

test('accepts real values, including extreme but living ones', () => {
  assert.equal(implausibleValue('Glucose', '612', 'mg/dL'), '');
  assert.equal(implausibleValue('Hemoglobin', '4.2', 'g/dL'), '');
  assert.equal(implausibleValue('Potassium', '6.8', 'mmol/L'), '');
  assert.equal(implausibleValue('Base Excess', '-8', 'mmol/L'), '');
});

test('text results and unit-less rows are not judged', () => {
  assert.equal(implausibleValue('HIV', 'Non reactive', ''), '');
  assert.equal(implausibleValue('Glucose', '999999', ''), '');
});

test('values with a comparison sign are read as numbers', () => {
  assert.match(implausibleValue('Glucose', '>5000', 'mg/dL'), /not a possible value/);
  assert.equal(implausibleValue('Troponin', '<0.01', 'ng/mL'), '');
});
