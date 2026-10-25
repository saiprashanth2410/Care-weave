import { queryExasol, pingExasol, updateSyncTelemetry } from './client.js';
import { initializeExasolSchema, schemaName } from './schema.js';
import { deriveLabOrders, deriveRx, deriveVisits } from './derive.js';
import { analyticsInput } from './sampleHistory.js';
// SQL literals. Exasol does not treat a backslash as an escape, so only the quote is doubled.
const str = (v, max = 256) => (v === null || v === undefined ? 'CAST(NULL AS VARCHAR(1))' : `'${String(v).replace(/\u0000/g, '').slice(0, max).replace(/'/g, "''")}'`);
const num = (v) => (v === null || !Number.isFinite(v) ? 'CAST(NULL AS DECIMAL(10,1))' : String(v));
const int = (v) => (v === null || !Number.isFinite(v) ? 'CAST(NULL AS INT)' : String(Math.round(v)));
const date = (v) => `CAST('${v}' AS DATE)`;
const ts = (v) => (v ? `CAST('${v}' AS TIMESTAMP)` : 'CAST(NULL AS TIMESTAMP)');
const bool = (v) => (v === null ? 'CAST(NULL AS BOOLEAN)' : v ? 'TRUE' : 'FALSE');
const BATCH = 200;
const chunks = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
/** Loads one table: batched MERGE (an upsert, so running it again changes nothing), then removes rows that no longer exist in the source. */
async function loadTable(table, keyCols, cols, rows, keyOf) {
    const on = keyCols.map((k) => `t.${k} = s.${k}`).join(' AND ');
    const set = cols.filter((c) => !keyCols.includes(c)).map((c) => `t.${c} = s.${c}`).join(', ');
    for (const part of chunks(rows, BATCH)) {
        await queryExasol(`MERGE INTO ${table} t USING (SELECT * FROM VALUES ${part.map((r) => `(${r.join(', ')})`).join(', ')} AS v(${cols.join(', ')})) s ON ${on} ` +
            `WHEN MATCHED THEN UPDATE SET ${set} WHEN NOT MATCHED THEN INSERT (${cols.join(', ')}) VALUES (${cols.map((c) => `s.${c}`).join(', ')})`);
    }
    // Keep Exasol a faithful mirror: drop rows whose source record was deleted. Skipped for very large loads.
    const keys = rows.map(keyOf);
    if (keys.length && keys.length <= 5000) {
        const tuple = (k) => (k.length === 1 ? k[0] : `(${k.join(', ')})`);
        await queryExasol(`DELETE FROM ${table} WHERE ${keyCols.length === 1 ? keyCols[0] : `(${keyCols.join(', ')})`} NOT IN (${keys.map(tuple).join(', ')})`);
    }
    else if (!keys.length) {
        await queryExasol(`DELETE FROM ${table}`);
    }
}
/**
 * Synchronises the application's visits, lab orders and prescriptions into Exasol.
 * It reports success only when Exasol accepted the load and holds the same number of rows afterwards.
 */
export async function syncDataToExasol(db) {
    const started = Date.now();
    const timestamp = new Date().toISOString();
    const input = analyticsInput(db);
    const visits = deriveVisits(input.appointments);
    const labs = deriveLabOrders(input.labOrders);
    const rx = deriveRx(input.prescriptions);
    const fail = (error) => ({
        success: false, live: false, engine: 'Exasol In-Memory Columnar', syncedVisits: 0, syncedLabOrders: 0, syncedPrescriptions: 0,
        durationMs: Date.now() - started, timestamp, error,
    });
    if (!(await pingExasol()))
        return fail('Exasol is not reachable, so nothing was synced. Start Exasol and try again.');
    try {
        await initializeExasolSchema();
        const schema = schemaName();
        await loadTable('FACT_PATIENT_VISITS', ['VISIT_ID'], ['VISIT_ID', 'PATIENT_ID', 'VISIT_DATE', 'VISIT_TIME', 'DEPARTMENT', 'DOCTOR_NAME', 'STATUS', 'REASON', 'WAIT_TIME_MINUTES'], visits.map((v) => [str(v.visitId, 64), str(v.patientId, 64), date(v.visitDate), str(v.visitTime, 16), str(v.department, 64), str(v.doctorName, 128), str(v.status, 32), str(v.reason), num(v.waitMinutes)]), (r) => [r[0]]);
        await loadTable('FACT_LAB_ORDERS_TAT', ['ORDER_ID'], ['ORDER_ID', 'PATIENT_ID', 'TEST_NAME', 'DEPARTMENT', 'PRIORITY', 'STATUS', 'CREATED_AT', 'COLLECTED_AT', 'VERIFIED_AT', 'RELEASED_AT', 'TAT_MINUTES', 'SLA_TARGET_MINUTES', 'WITHIN_SLA', 'CRITICAL_FLAG_COUNT', 'ABNORMAL_FLAG_COUNT'], labs.map((o) => [str(o.orderId, 64), str(o.patientId, 64), str(o.testName, 128), str(o.department, 64), str(o.priority, 16), str(o.status, 32), ts(o.orderedAt), ts(o.collectedAt), ts(o.verifiedAt), ts(o.releasedAt), num(o.tatMinutes), int(o.slaTargetMinutes), bool(o.withinSla), int(o.criticalFlagCount), int(o.abnormalFlagCount)]), (r) => [r[0]]);
        // A prescription can hold the same medicine twice; the table's key is (prescription, medicine), so keep the first.
        const seen = new Set();
        const rxRows = rx.filter((r) => !seen.has(r.prescriptionId + '|' + r.medicineName) && seen.add(r.prescriptionId + '|' + r.medicineName));
        await loadTable('FACT_PHARMACY_PRESCRIPTIONS', ['PRESCRIPTION_ID', 'MEDICINE_NAME'], ['PRESCRIPTION_ID', 'PATIENT_ID', 'DOCTOR_NAME', 'PRESCRIBED_DATE', 'MEDICINE_NAME', 'GENERIC_NAME', 'FORM', 'DOSAGE', 'QUANTITY', 'DURATION_DAYS', 'ALLERGY_ALERT_TRIGGERED', 'DUPLICATE_OVERRIDE'], rxRows.map((r) => [str(r.prescriptionId, 64), str(r.patientId, 64), str(r.doctorName, 128), date(r.prescribedDate), str(r.medicineName), str(r.genericName), str(r.form, 64), str(r.dosage, 128), int(r.quantity), int(r.durationDays), bool(r.allergyOverride), bool(r.duplicateOverride)]), (r) => [r[0], r[4]]);
        const c = (await queryExasol(`SELECT (SELECT COUNT(*) FROM ${schema}.FACT_PATIENT_VISITS) AS "v", (SELECT COUNT(*) FROM ${schema}.FACT_LAB_ORDERS_TAT) AS "l", (SELECT COUNT(*) FROM ${schema}.FACT_PHARMACY_PRESCRIPTIONS) AS "p" FROM DUAL`))[0];
        const verified = { visits: Number(c.v), labOrders: Number(c.l), prescriptions: Number(c.p) };
        const expected = { visits: visits.length, labOrders: labs.length, prescriptions: rxRows.length };
        if (verified.visits !== expected.visits || verified.labOrders !== expected.labOrders || verified.prescriptions !== expected.prescriptions) {
            return { ...fail(`Row counts in Exasol do not match the source after loading (Exasol ${JSON.stringify(verified)}, source ${JSON.stringify(expected)}).`), verified };
        }
        updateSyncTelemetry(expected.visits + expected.labOrders + expected.prescriptions);
        return {
            success: true, live: true, engine: 'Exasol In-Memory Columnar (Live)',
            syncedVisits: expected.visits, syncedLabOrders: expected.labOrders, syncedPrescriptions: expected.prescriptions,
            verified, durationMs: Date.now() - started, timestamp,
        };
    }
    catch (err) {
        console.error('[Exasol Sync Error]:', err);
        return fail(err?.message || 'Sync failed');
    }
}
