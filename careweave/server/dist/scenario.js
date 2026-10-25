// Loads one synthetic patient journey by calling the real API as each role, so every rule, link and audit entry
// is produced the same way it would be in use. Nothing here writes to the database directly.
export const SAMPLE_NAME = 'Priya Raman';
export const SAMPLE_DOB = '1984-03-12';
export async function runScenario(base, users, patients, mint, requester) {
    if (patients.some((p) => p.sample))
        return { loaded: false, message: 'The sample scenario is already loaded.' };
    const doctor = requester.role === 'doctor' ? requester : users.find((u) => u.role === 'doctor');
    const receptionist = requester.role === 'receptionist' ? requester : users.find((u) => u.role === 'receptionist');
    const labs = users.filter((u) => u.role === 'lab');
    const verifier = labs.find((u) => (u.permissions || []).includes('verify'));
    const enterer = labs.find((u) => u.id !== verifier?.id);
    if (!doctor || !receptionist || !verifier || !enterer)
        throw new Error('Needs a front desk, a doctor, a lab user and a second lab user who can verify.');
    const tok = { rec: mint(receptionist.id), doc: mint(doctor.id), lab: mint(enterer.id), ver: mint(verifier.id) };
    const call = async (method, path, token, body) => {
        const r = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
        const json = await r.json().catch(() => ({}));
        if (!r.ok)
            throw new Error(`${method} ${path} failed (${r.status}): ${json.error ?? 'unknown'}`);
        return json;
    };
    const patch = (id, token, body) => call('PATCH', `/api/lab/orders/${id}`, token, body).then((j) => j.data);
    const today = new Date().toISOString().slice(0, 10);
    const pat = await call('POST', '/api/patients', tok.rec, { name: SAMPLE_NAME, dob: SAMPLE_DOB, phone: '+91 98450 11122', gender: 'F', email: 'sample.patient@example.test' });
    await call('POST', '/api/appointments', tok.rec, { patientId: pat.id, doctorId: doctor.id, date: today, time: '10:30', reason: 'Diabetes review' });
    // Every doctor account gets a booking, so whichever doctor signs in for the demo can open this chart.
    const others = users.filter((u) => u.role === 'doctor' && u.id !== doctor.id);
    for (const [i, d] of others.entries())
        await call('POST', '/api/appointments', tok.rec, { patientId: pat.id, doctorId: d.id, date: today, time: `1${i + 1}:00`, reason: 'Review of results' });
    await call('POST', '/api/encounters', tok.doc, { patientId: pat.id, subjective: 'Tired through the afternoon, increased thirst.', objective: 'Alert, afebrile.', assessment: 'Type 2 diabetes, control to be reviewed.', plan: 'HbA1c and lipid profile, review with results.', diagnosis: 'Type 2 diabetes follow-up' });
    await call('POST', `/api/patients/${pat.id}/allergies`, tok.doc, { allergen: 'Penicillin', severity: 'Moderate', reaction: 'Skin rash' });
    // A medicine picked from the catalogue (data/BrandMaster.tsv), prescribed by the doctor against the encounter.
    await call('POST', '/api/prescriptions', tok.doc, { patientId: pat.id, medicine: 'Trajenta Duo (linagliptin and metformin hydrochloride) 2.5 mg + 500 mg oral tablet', dosage: '2.5 mg + 500 mg', route: 'Oral', frequency: 'Twice daily with meals', duration: '90 days', refills: 2, instructions: 'Take with food.' });
    // 1. Released result: entered by one lab user, verified and released by a different one.
    const a = await call('POST', '/api/lab-orders', tok.doc, { patientId: pat.id, testName: 'HbA1c', priority: 'Routine', clinicalIndication: 'Diabetes review' });
    await patch(a.id, tok.lab, { status: 'collected' });
    await patch(a.id, tok.lab, { status: 'awaiting_verification', results: [{ parameter: 'HbA1c', value: '7.9', unit: '%', referenceRange: '4.0-5.6' }] });
    await patch(a.id, tok.ver, { status: 'released' });
    // 2. A second order left waiting for a verifier, so the four-eyes step can be shown live.
    const b = await call('POST', '/api/lab-orders', tok.doc, { patientId: pat.id, testName: 'Lipid Profile', priority: 'Routine', clinicalIndication: 'Cardiovascular risk' });
    await patch(b.id, tok.lab, { status: 'collected' });
    await patch(b.id, tok.lab, { status: 'awaiting_verification', results: [{ parameter: 'TOTAL CHOLESTEROL', value: '212', unit: 'mg/dl', referenceRange: '< 200' }, { parameter: 'LDL', value: '134', unit: 'mg/dl', referenceRange: '< 100' }] });
    // 3. Outside-hospital report, repeated, then repeated with a different value.
    const ext = { facility: 'Sample Outside Laboratory', kind: 'lab', sourceRecordId: 'SOL-1042', eventDate: today, patient: { identifier: pat.patientId, dob: SAMPLE_DOB }, content: { testName: 'HbA1c', value: '7.9', units: '%', referenceRange: '4.0-5.6' } };
    await call('POST', '/api/external-records/import', tok.doc, ext);
    await call('POST', '/api/external-records/import', tok.doc, ext);
    await call('POST', '/api/external-records/import', tok.doc, { ...ext, content: { ...ext.content, value: '9.4' } });
    return { loaded: true, patientId: pat.patientId, waitingOrder: b.id, message: 'Sample scenario loaded.' };
}
