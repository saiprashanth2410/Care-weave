import { queryExasol, pingExasol, updateSyncTelemetry } from './client.js';
import { initializeExasolSchema, schemaName } from './schema.js';
import { deriveLabOrders, deriveRx, deriveVisits } from './derive.js';
import { analyticsInput } from './sampleHistory.js';

/** The Exasol operations the sync needs. Tests pass a fake; production uses the real connection. */
export interface ExasolPort {
  ping(): Promise<boolean>;
  init(): Promise<void>;
  schema(): string;
  query<T = any>(sql: string): Promise<T[]>;
}
export const realExasol: ExasolPort = { ping: pingExasol, init: initializeExasolSchema, schema: schemaName, query: queryExasol };

export type SyncKind = 'appointments' | 'labOrders' | 'prescriptions' | 'syntheticHistory';
/** Where records come from: pages of at most a few hundred documents, so memory stays flat however large the collections are. */
export interface SyncSource { pages(kind: SyncKind, since?: string): AsyncIterable<any[]> }

// SQL literals. Exasol does not treat a backslash as an escape, so only the quote is doubled.
const str = (v: unknown, max = 256) => (v === null || v === undefined ? 'CAST(NULL AS VARCHAR(1))' : `'${String(v).replace(/\u0000/g, '').slice(0, max).replace(/'/g, "''")}'`);
const num = (v: number | null) => (v === null || !Number.isFinite(v) ? 'CAST(NULL AS DECIMAL(10,1))' : String(v));
const int = (v: number | null) => (v === null || !Number.isFinite(v) ? 'CAST(NULL AS INT)' : String(Math.round(v)));
const date = (v: string) => `CAST('${v}' AS DATE)`;
const ts = (v: string | null) => (v ? `CAST('${v}' AS TIMESTAMP)` : 'CAST(NULL AS TIMESTAMP)');
const bool = (v: boolean | null) => (v === null ? 'CAST(NULL AS BOOLEAN)' : v ? 'TRUE' : 'FALSE');

const BATCH = 200;
const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export interface SyncResult {
  success: boolean;
  /** 'full' reads every record and removes Exasol rows whose source is gone; 'incremental' loads only what changed since the last sync. */
  mode: 'full' | 'incremental';
  /** True only when the rows were loaded into Exasol and counted back from it. */
  live: boolean;
  engine: string;
  syncedVisits: number;
  syncedLabOrders: number;
  syncedPrescriptions: number;
  /** Rows counted in Exasol after the load. They must equal the synced counts for the sync to succeed. */
  verified?: { visits: number; labOrders: number; prescriptions: number };
  durationMs: number;
  timestamp: string;
  error?: string;
}

const PRUNE_LIMIT = 5000;
const tupleOf = (k: string[]) => (k.length === 1 ? k[0] : `(${k.join(', ')})`);
const keyExpr = (keyCols: string[]) => (keyCols.length === 1 ? keyCols[0] : `(${keyCols.join(', ')})`);

/** Upserts one page into a table (batched MERGE, so running it again changes nothing), then checks Exasol now holds those keys. */
async function upsert(x: ExasolPort, table: string, keyCols: string[], cols: string[], rows: string[][], keyOf: (row: string[]) => string[]) {
  if (!rows.length) return;
  const on = keyCols.map((k) => `t.${k} = s.${k}`).join(' AND ');
  const set = cols.filter((c) => !keyCols.includes(c)).map((c) => `t.${c} = s.${c}`).join(', ');
  for (const part of chunks(rows, BATCH)) {
    await x.query(
      `MERGE INTO ${table} t USING (SELECT * FROM VALUES ${part.map((r) => `(${r.join(', ')})`).join(', ')} AS v(${cols.join(', ')})) s ON ${on} ` +
      `WHEN MATCHED THEN UPDATE SET ${set} WHEN NOT MATCHED THEN INSERT (${cols.join(', ')}) VALUES (${cols.map((c) => `s.${c}`).join(', ')})`
    );
    const found = (await x.query<any>(`SELECT COUNT(*) AS "n" FROM ${table} WHERE ${keyExpr(keyCols)} IN (${part.map((r) => tupleOf(keyOf(r))).join(', ')})`))[0];
    if (Number(found.n) !== part.length) throw new Error(`${table}: loaded ${part.length} rows but Exasol holds ${Number(found.n)} of them afterwards`);
  }
}

/** Removes rows whose source record no longer exists. Only a full sync does this, and not for very large loads. */
async function prune(x: ExasolPort, table: string, keyCols: string[], keys: string[][] | null) {
  if (keys === null) return; // too many keys to list in one statement
  if (!keys.length) { await x.query(`DELETE FROM ${table}`); return; }
  await x.query(`DELETE FROM ${table} WHERE ${keyExpr(keyCols)} NOT IN (${keys.map(tupleOf).join(', ')})`);
}

const VISIT_COLS = ['VISIT_ID', 'PATIENT_ID', 'VISIT_DATE', 'VISIT_TIME', 'DEPARTMENT', 'DOCTOR_NAME', 'STATUS', 'REASON', 'WAIT_TIME_MINUTES'];
const LAB_COLS = ['ORDER_ID', 'PATIENT_ID', 'TEST_NAME', 'DEPARTMENT', 'PRIORITY', 'STATUS', 'CREATED_AT', 'COLLECTED_AT', 'VERIFIED_AT', 'RELEASED_AT', 'TAT_MINUTES', 'SLA_TARGET_MINUTES', 'WITHIN_SLA', 'CRITICAL_FLAG_COUNT', 'ABNORMAL_FLAG_COUNT'];
const RX_COLS = ['PRESCRIPTION_ID', 'PATIENT_ID', 'DOCTOR_NAME', 'PRESCRIBED_DATE', 'MEDICINE_NAME', 'GENERIC_NAME', 'FORM', 'DOSAGE', 'QUANTITY', 'DURATION_DAYS', 'ALLERGY_ALERT_TRIGGERED', 'DUPLICATE_OVERRIDE'];

/**
 * Synchronises the application's visits, lab orders and prescriptions into Exasol, one page of records at a time.
 * With `since` (an ISO time) only records changed after it are loaded; without it every record is read and Exasol rows whose
 * source is gone are removed. It reports success only when each loaded page is found in Exasol and, for a full sync,
 * the table totals equal the number of rows loaded.
 */
export async function syncDataToExasol(source: SyncSource, opts: { since?: string; port?: ExasolPort } = {}): Promise<SyncResult> {
  const x = opts.port ?? realExasol;
  const started = Date.now();
  const timestamp = new Date().toISOString();
  const mode = opts.since ? 'incremental' : 'full';
  const fail = (error: string): SyncResult => ({
    success: false, mode, live: false, engine: 'Exasol In-Memory Columnar', syncedVisits: 0, syncedLabOrders: 0, syncedPrescriptions: 0,
    durationMs: Date.now() - started, timestamp, error,
  });

  if (!(await x.ping())) return fail('Exasol is not reachable, so nothing was synced. Start Exasol and try again.');

  try {
    await x.init();
    const schema = x.schema();
    const kept = { visits: [] as string[][] | null, labs: [] as string[][] | null, rx: [] as string[][] | null };
    const loaded = { visits: 0, labs: 0, rx: 0 };
    const remember = (list: string[][] | null, keys: string[][]) => (list === null || list.length + keys.length > PRUNE_LIMIT ? null : (list.push(...keys), list));

    for (const kind of ['appointments', 'labOrders', 'prescriptions', 'syntheticHistory'] as const) {
      for await (const page of source.pages(kind, opts.since)) {
        const input = analyticsInput({ appointments: [], labOrders: [], prescriptions: [], syntheticHistory: [], [kind]: page });
        const visits = deriveVisits(input.appointments);
        const labs = deriveLabOrders(input.labOrders);
        // A prescription can hold the same medicine twice; the table's key is (prescription, medicine), so keep the first.
        const seen = new Set<string>();
        const rx = deriveRx(input.prescriptions).filter((r) => !seen.has(r.prescriptionId + '|' + r.medicineName) && seen.add(r.prescriptionId + '|' + r.medicineName));

        const visitRows = visits.map((v) => [str(v.visitId, 64), str(v.patientId, 64), date(v.visitDate), str(v.visitTime, 16), str(v.department, 64), str(v.doctorName, 128), str(v.status, 32), str(v.reason), num(v.waitMinutes)]);
        await upsert(x, 'FACT_PATIENT_VISITS', ['VISIT_ID'], VISIT_COLS, visitRows, (r) => [r[0]]);
        const labRows = labs.map((o) => [str(o.orderId, 64), str(o.patientId, 64), str(o.testName, 128), str(o.department, 64), str(o.priority, 16), str(o.status, 32), ts(o.orderedAt), ts(o.collectedAt), ts(o.verifiedAt), ts(o.releasedAt), num(o.tatMinutes), int(o.slaTargetMinutes), bool(o.withinSla), int(o.criticalFlagCount), int(o.abnormalFlagCount)]);
        await upsert(x, 'FACT_LAB_ORDERS_TAT', ['ORDER_ID'], LAB_COLS, labRows, (r) => [r[0]]);
        const rxRows = rx.map((r) => [str(r.prescriptionId, 64), str(r.patientId, 64), str(r.doctorName, 128), date(r.prescribedDate), str(r.medicineName), str(r.genericName), str(r.form, 64), str(r.dosage, 128), int(r.quantity), int(r.durationDays), bool(r.allergyOverride), bool(r.duplicateOverride)]);
        await upsert(x, 'FACT_PHARMACY_PRESCRIPTIONS', ['PRESCRIPTION_ID', 'MEDICINE_NAME'], RX_COLS, rxRows, (r) => [r[0], r[4]]);

        loaded.visits += visitRows.length; loaded.labs += labRows.length; loaded.rx += rxRows.length;
        if (mode === 'full') {
          kept.visits = remember(kept.visits, visitRows.map((r) => [r[0]]));
          kept.labs = remember(kept.labs, labRows.map((r) => [r[0]]));
          kept.rx = remember(kept.rx, rxRows.map((r) => [r[0], r[4]]));
        }
      }
    }

    if (mode === 'full') {
      await prune(x, 'FACT_PATIENT_VISITS', ['VISIT_ID'], kept.visits);
      await prune(x, 'FACT_LAB_ORDERS_TAT', ['ORDER_ID'], kept.labs);
      await prune(x, 'FACT_PHARMACY_PRESCRIPTIONS', ['PRESCRIPTION_ID', 'MEDICINE_NAME'], kept.rx);
    }

    const c = (await x.query<any>(
      `SELECT (SELECT COUNT(*) FROM ${schema}.FACT_PATIENT_VISITS) AS "v", (SELECT COUNT(*) FROM ${schema}.FACT_LAB_ORDERS_TAT) AS "l", (SELECT COUNT(*) FROM ${schema}.FACT_PHARMACY_PRESCRIPTIONS) AS "p" FROM DUAL`
    ))[0];
    const verified = { visits: Number(c.v), labOrders: Number(c.l), prescriptions: Number(c.p) };
    if (mode === 'full' && kept.visits && kept.labs && kept.rx && (verified.visits !== loaded.visits || verified.labOrders !== loaded.labs || verified.prescriptions !== loaded.rx)) {
      return { ...fail(`Row counts in Exasol do not match the source after loading (Exasol ${JSON.stringify(verified)}, source ${JSON.stringify({ visits: loaded.visits, labOrders: loaded.labs, prescriptions: loaded.rx })}).`), verified };
    }

    updateSyncTelemetry(verified.visits + verified.labOrders + verified.prescriptions);
    return {
      success: true, mode, live: true, engine: 'Exasol In-Memory Columnar (Live)',
      syncedVisits: loaded.visits, syncedLabOrders: loaded.labs, syncedPrescriptions: loaded.rx,
      verified, durationMs: Date.now() - started, timestamp,
    };
  } catch (err: any) {
    console.error('[Exasol Sync Error]:', err);
    return fail(err?.message || 'Sync failed');
  }
}
