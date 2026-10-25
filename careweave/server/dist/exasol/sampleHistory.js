// A clearly synthetic 30-day history, so the analytics have something to show beyond one demo patient.
// It lives in its own collection (syntheticHistory), never in the appointments, lab or prescription collections the portals read,
// and every figure the dashboard builds from it is counted and disclosed. It is generated from a fixed seed, so it is reproducible.
function rng(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const DOCTORS = ['Dr. Anirban Laha', 'Dr. Meera Iyer', 'Dr. Rohan Das'];
const REASONS = [['Diabetes review', 0.3], ['Chest pain', 0.15], ['Fever and cough', 0.35], ['Routine check-up', 0.2]];
// Cardiology patients wait longer than others; the generator reflects that so the department comparison has something to show.
const WAIT = { 'Chest pain': [18, 45], 'Diabetes review': [10, 28], 'Fever and cough': [6, 20], 'Routine check-up': [5, 15] };
const TESTS = [
    ['Complete Blood Count (CBC)', 'Hematology', [35, 90]], ['HbA1c', 'Biochemistry', [60, 150]], ['Lipid Profile', 'Biochemistry', [90, 210]],
    ['Liver Function Test', 'Biochemistry', [100, 230]], ['Cardiac Troponin I', 'Biochemistry', [20, 70]],
];
const MEDS = [
    ['Glycomet (metformin hydrochloride) 500 mg oral tablet', 'Twice daily', '30 days', 0.3],
    ['Augmentin 625 (amoxicillin and clavulanic acid) 500 mg + 125 mg oral tablet', 'Twice daily', '5 days', 0.15],
    ['Dolo (paracetamol) 650 mg oral tablet', 'Three times daily', '3 days', 0.3],
    ['Lipitor (atorvastatin calcium) 20 mg oral tablet', 'Once daily', '30 days', 0.15],
    ['Pan 40 (pantoprazole sodium) 40 mg oral tablet', 'Once daily', '14 days', 0.1],
];
// Picks one item at random, weighted by the number in its last position.
const pick = (r, items) => {
    let x = r(), acc = 0;
    for (const it of items) {
        acc += it[it.length - 1];
        if (x <= acc)
            return it;
    }
    return items[items.length - 1];
};
const iso = (d, minutes) => new Date(d.getTime() + minutes * 60000).toISOString();
export function generateSampleHistory(today = new Date(), days = 30) {
    const r = rng(2026);
    const out = [];
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    for (let back = days; back >= 1; back--) {
        const day = new Date(start.getTime() - back * 86400000);
        const dow = day.getUTCDay();
        const volume = dow === 0 ? 4 : dow === 6 ? 9 : 14 + Math.floor(r() * 9);
        const date = day.toISOString().slice(0, 10);
        for (let i = 0; i < volume; i++) {
            const id = `SYN-${date}-${i}`;
            const [reason] = pick(r, REASONS);
            const [lo, hi] = WAIT[reason];
            const at = new Date(day.getTime() + (9 * 60 + Math.floor(r() * 7 * 60)) * 60000);
            const roll = r();
            const status = roll < 0.07 ? 'Cancelled' : roll < 0.11 ? 'No Show' : 'Completed';
            const wait = Math.round(lo + r() * (hi - lo));
            const rec = { id, patientId: `SYN-P${Math.floor(r() * 400)}`, doctorName: DOCTORS[Math.floor(r() * DOCTORS.length)], date, time: at.toISOString().slice(11, 16), reason, status, synthetic: true };
            if (status === 'Completed') {
                rec.checkedInAt = at.toISOString();
                rec.startedAt = iso(at, wait);
                rec.completedAt = iso(at, wait + 15);
            }
            out.push({ id, kind: 'appointment', record: rec });
            if (status === 'Completed' && r() < 0.55) {
                const [test, department, [a, b]] = TESTS[Math.floor(r() * TESTS.length)];
                const urgent = test.startsWith('Cardiac') || r() < 0.12;
                const tat = Math.round(a + r() * (b - a));
                const recent = back <= 1 && r() < 0.5; // yesterday's orders may still be in progress
                const o = { id: `SYN-ORD-${date}-${i}`, patientId: rec.patientId, testName: test, department, priority: urgent ? 'urgent' : 'routine', orderedAt: iso(at, wait + 10), collectedAt: iso(at, wait + 10 + 8 + Math.floor(r() * 20)), status: recent ? 'processing' : 'released', synthetic: true };
                if (!recent) {
                    o.verifiedAt = iso(at, wait + 10 + tat);
                    o.results = [{ flag: r() < 0.06 ? 'critical' : r() < 0.2 ? 'abnormal' : 'normal' }];
                }
                out.push({ id: o.id, kind: 'labOrder', record: o });
            }
            if (status === 'Completed' && r() < 0.75) {
                const [medicine, frequency, duration] = pick(r, MEDS);
                const p = { id: `SYN-RX-${date}-${i}`, patientId: rec.patientId, medicine, dosage: '', frequency, duration, status: 'Active', date: iso(at, wait + 20), prescribingClinician: rec.doctorName, synthetic: true };
                out.push({ id: p.id, kind: 'prescription', record: p });
            }
        }
    }
    return out;
}
/** The application's own records plus any synthetic sample history, as the three arrays the analytics read. */
export function analyticsInput(db) {
    const hist = db?.syntheticHistory || [];
    const of = (kind) => hist.filter((h) => h.kind === kind).map((h) => h.record);
    return {
        appointments: [...(db?.appointments || []), ...of('appointment')],
        labOrders: [...(db?.labOrders || []), ...of('labOrder')],
        prescriptions: [...(db?.prescriptions || []), ...of('prescription')],
        syntheticRecords: hist.length,
    };
}
