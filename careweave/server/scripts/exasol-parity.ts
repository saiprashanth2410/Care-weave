// Live check against a real Exasol: loads a small SYNTHETIC dataset into a throwaway schema, then verifies
//  1. the sync is idempotent and mirrors deletions, and reports only what Exasol actually holds,
//  2. every metric computed by Exasol SQL equals the same metric computed in code from the same rows,
//  3. a table created by an older version of the schema is upgraded in place.
// Skips (exit 0) when Exasol is not reachable. Run: npm run test:exasol
process.env.EXASOL_SCHEMA = 'CAREWEAVE_PARITY_TEST';
import 'dotenv/config';
process.env.EXASOL_SCHEMA = 'CAREWEAVE_PARITY_TEST';
const { pingExasol, queryExasol } = await import('../src/exasol/client.js');
const { syncDataToExasol } = await import('../src/exasol/sync.js');
const { getAnalyticsOverview } = await import('../src/exasol/queries.js');
const m = await import('../src/exasol/metrics.js');
const { deriveVisits, deriveLabOrders, deriveRx } = await import('../src/exasol/derive.js');

if (!(await pingExasol())) { console.log('SKIP  Exasol is not reachable'); process.exit(0); }

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); };

const at = (d: number, min = 0) => new Date(Date.UTC(2026, 9, 20 + d, 9, min)).toISOString();
const db: any = { patients: [{}, {}], auditLogs: [], appointments: [], labOrders: [], prescriptions: [] };
for (let i = 0; i < 12; i++) db.appointments.push({ id: `a${i}`, patientId: `p${i % 4}`, date: `2026-10-${20 + (i % 5)}`, time: '10:00', reason: i % 3 ? 'Diabetes review' : 'Chest pain', doctorName: i % 2 ? 'Dr A' : 'Dr B', status: i % 4 ? 'Completed' : 'Scheduled', checkedInAt: i % 2 ? at(i % 5) : undefined, startedAt: i % 2 ? at(i % 5, 10 + i) : undefined });
for (let i = 0; i < 9; i++) db.labOrders.push({ id: `ORD-${i}`, patientId: 'p1', testName: i % 2 ? 'HbA1c' : 'CBC', department: 'Biochemistry', priority: i % 3 ? 'routine' : 'urgent', status: i < 6 ? 'released' : 'processing', orderedAt: at(0), collectedAt: at(0, 15), verifiedAt: i < 6 ? at(0, 40 + i * 25) : undefined, results: [{ flag: i === 2 ? 'critical' : 'normal' }] });
for (let i = 0; i < 6; i++) db.prescriptions.push({ id: `rx${i}`, patientId: 'p1', medicine: i % 2 ? 'Augmentin 625 (amoxicillin + clavulanic acid) oral tablet' : 'Metformin HCl', dosage: '500 mg', frequency: 'Twice daily', duration: i === 5 ? '' : '5 days', date: at(i % 3), prescribingClinician: 'Dr A' });

const drop = () => queryExasol('DROP SCHEMA IF EXISTS CAREWEAVE_PARITY_TEST CASCADE');
try {
  await drop();
  // An older deployment: whole-minute TAT and no flag columns.
  await queryExasol('CREATE SCHEMA CAREWEAVE_PARITY_TEST');
  await queryExasol('OPEN SCHEMA CAREWEAVE_PARITY_TEST');
  await queryExasol('CREATE TABLE FACT_LAB_ORDERS_TAT (ORDER_ID VARCHAR(64) PRIMARY KEY, PATIENT_ID VARCHAR(64), TEST_NAME VARCHAR(128), DEPARTMENT VARCHAR(64), PRIORITY VARCHAR(16), STATUS VARCHAR(32), CREATED_AT TIMESTAMP, COLLECTED_AT TIMESTAMP, VERIFIED_AT TIMESTAMP, RELEASED_AT TIMESTAMP, TAT_MINUTES INT, SLA_TARGET_MINUTES INT, WITHIN_SLA BOOLEAN, CRITICAL_FLAG_COUNT INT)');
  // A row left by the old sync, which invented a turnaround for an order that never finished.
  await queryExasol(`INSERT INTO FACT_LAB_ORDERS_TAT (ORDER_ID, PATIENT_ID, TEST_NAME, STATUS, TAT_MINUTES, SLA_TARGET_MINUTES, WITHIN_SLA, CRITICAL_FLAG_COUNT) VALUES ('ORD-7', 'p1', 'HbA1c', 'processing', 38, 120, TRUE, 0)`);
  let r = await syncDataToExasol(db);
  check('first sync succeeds and is verified live', r.success && r.live && r.verified?.visits === 12 && r.verified?.labOrders === 9 && r.verified?.prescriptions === 6, JSON.stringify(r));
  check('an old table is upgraded in place', (await queryExasol<any>(`SELECT COLUMN_NAME AS "n" FROM EXA_ALL_COLUMNS WHERE COLUMN_SCHEMA = 'CAREWEAVE_PARITY_TEST' AND COLUMN_TABLE = 'FACT_LAB_ORDERS_TAT' AND COLUMN_NAME = 'ABNORMAL_FLAG_COUNT'`)).length === 1);
  r = await syncDataToExasol(db);
  check('syncing again changes nothing (idempotent)', r.success && r.verified?.visits === 12 && r.verified?.labOrders === 9);
  db.appointments.pop(); db.labOrders.pop();
  r = await syncDataToExasol(db);
  check('deleted source records are removed from Exasol', r.success && r.verified?.visits === 11 && r.verified?.labOrders === 8, JSON.stringify(r.verified));

  const ov = await getAnalyticsOverview(db);
  check('overview is computed by Exasol and says so', ov.source.live && ov.queries.every((q) => q.engine === 'exasol' && q.rows > 0), JSON.stringify(ov.source));
  const visits = deriveVisits(db.appointments), labs = deriveLabOrders(db.labOrders), rx = deriveRx(db.prescriptions);
  const same = (name: string, a: unknown, b: unknown) => check(`Exasol SQL equals the code for ${name}`, JSON.stringify(a) === JSON.stringify(b), `exasol ${JSON.stringify(a)} vs code ${JSON.stringify(b)}`);
  same('daily visits and moving average', ov.visitsTrend, m.visitsTrend(visits));
  same('department workload', ov.departmentWorkload, m.departmentWorkload(visits));
  same('lab turnaround, p90 and SLA', ov.labTat, m.labTat(labs));
  same('lab stage durations', ov.labStages, m.labStages(labs));
  same('pharmacy demand estimate', ov.pharmacyConsumption, m.pharmacyConsumption(rx));
  const bad = await queryExasol<any>('SELECT COUNT(*) AS "n" FROM FACT_LAB_ORDERS_TAT WHERE TAT_MINUTES IS NOT NULL AND (VERIFIED_AT IS NULL OR STATUS NOT IN (\'verified\', \'released\'))');
  check('invariant in Exasol: a turnaround exists only for a verified or released order with a verify time', Number(bad[0].n) === 0, String(bad[0].n));
  const stale = await queryExasol<any>(`SELECT TAT_MINUTES AS "t", WITHIN_SLA AS "w" FROM FACT_LAB_ORDERS_TAT WHERE ORDER_ID = 'ORD-7'`);
  check('a turnaround invented by the old sync is overwritten with NULL', stale.length === 1 && stale[0].t === null && stale[0].w === null, JSON.stringify(stale));
  check('release time is never copied from the verification time', Number((await queryExasol<any>('SELECT COUNT(*) AS "n" FROM FACT_LAB_ORDERS_TAT WHERE RELEASED_AT IS NOT NULL'))[0].n) === 0);
  check('orders still being processed have no turnaround time', ov.labTat.reduce((n, l) => n + l.pendingOrders, 0) === 2 && ov.dataQuality.labOrdersPending === 2);
} catch (err: any) {
  failed++;
  console.log('FAIL  ', err?.message || err);
} finally {
  await drop().catch(() => undefined);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
