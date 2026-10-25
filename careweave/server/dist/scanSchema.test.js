import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRange, normalize } from './scanSchema.js';
const base = {
    patientName: 'A', patientUhid: '', visitNo: '', labNo: '', patientAge: 40, patientGender: 'M', opIp: 'OP',
    referralDoctor: '', orderingDoctor: '', testName: 'Lipid', department: '', priority: 'routine', impression: ''
};
const row = (o) => ({ parameter: 'LDL', value: '100', unit: 'mg/dL', referenceRange: '< 100', methodology: '', subGroup: '', flag: 'normal', unclear: false, ...o });
test('checkRange reads the common range styles', () => {
    assert.equal(checkRange('242', '< 200'), 'high');
    assert.equal(checkRange('38', '> 40'), 'low');
    assert.equal(checkRange('90', '70 - 110'), 'in');
    assert.equal(checkRange('120', '70-110'), 'high');
    assert.equal(checkRange('Positive', '< 5'), 'unknown');
    assert.equal(checkRange('5', 'see note'), 'unknown');
});
test('a normal flag on an out-of-range value needs a check', () => {
    const out = normalize({ ...base, results: [row({ value: '190', referenceRange: '< 150' })] });
    assert.equal(out.results[0].needsCheck, true);
    assert.match(out.results[0].checkReason, /outside the printed range/);
    assert.match(out.warnings.join(' '), /1 row needs/);
});
test('an abnormal flag on an in-range value needs a check', () => {
    const out = normalize({ ...base, results: [row({ value: '90', referenceRange: '70-110', flag: 'abnormal' })] });
    assert.equal(out.results[0].needsCheck, true);
});
test('an unclear row is held back for checking, and a consistent row is not', () => {
    const out = normalize({ ...base, results: [row({ unclear: true }), row({ value: '80', referenceRange: '< 100' })] });
    assert.equal(out.results[0].needsCheck, true);
    assert.equal(out.results[1].needsCheck, false);
});
test('empty rows are dropped and an empty report warns', () => {
    const out = normalize({ ...base, patientName: '', results: [row({ parameter: '', value: '' })] });
    assert.equal(out.results.length, 0);
    assert.equal(out.warnings.length, 2);
});
