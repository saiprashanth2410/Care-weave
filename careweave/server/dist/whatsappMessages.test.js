import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePrescriptions, latestReport, scheduleOf } from './whatsapp/messages.js';
// Regression: found by /qa on 2026-11-01
test('a weekly or as-needed medicine is not read as a daily morning dose', () => {
    assert.equal(scheduleOf('once weekly'), null);
    assert.equal(scheduleOf('as needed'), null);
    assert.deepEqual(scheduleOf('once daily'), ['morning']);
    assert.deepEqual(scheduleOf('1-0-1'), ['morning', 'night']);
});
test('people who share a phone number only see the patient whose UHID they send', () => {
    const db = {
        patients: [
            { id: 'p1', patientId: 'CW-1', name: 'Asha', phone: '98765 43210' },
            { id: 'p2', patientId: 'CW-2', name: 'Ravi', phone: '9876543210' },
        ],
        prescriptions: [{ patientId: 'p2', status: 'Active', medicine: 'Metformin', dosage: '500 mg', frequency: 'twice daily', date: new Date().toISOString() }],
        labOrders: [{ id: 'o1', status: 'verified', registeredPatientRef: 'p2', patientId: 'CW-2', testName: 'CBC', verifiedAt: '2026-01-01', results: [{ parameter: 'Hb', value: '13', unit: 'g/dL' }] }],
        appointments: [],
    };
    const report = latestReport(db, { phone: '9876543210', uhid: 'CW-2' });
    assert.equal(report.found && report.patient.name, 'Ravi');
    const meds = activePrescriptions(db, { phone: '9876543210', uhid: 'CW-2' });
    assert.equal(meds.found && 'medications' in meds && meds.medications[0].medicine, 'Metformin');
    const other = activePrescriptions(db, { phone: '9876543210', uhid: 'CW-1' });
    assert.equal(other.medications.length, 0, 'Asha does not see Ravi\'s medicines');
});
