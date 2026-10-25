import { getExasolConfig, queryExasol } from './client.js';

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;
export const schemaName = () => {
  const name = getExasolConfig().schema;
  if (!IDENT.test(name)) throw new Error(`EXASOL_SCHEMA "${name}" is not a plain identifier`);
  return name.toUpperCase();
};

// Each table: columns in order. A column added in a later version is added to an existing table by ensureColumns().
export const TABLES: Record<string, { pk: string; cols: [string, string][] }> = {
  FACT_PATIENT_VISITS: {
    pk: 'VISIT_ID',
    cols: [['VISIT_ID', 'VARCHAR(64)'], ['PATIENT_ID', 'VARCHAR(64)'], ['VISIT_DATE', 'DATE'], ['VISIT_TIME', 'VARCHAR(16)'], ['DEPARTMENT', 'VARCHAR(64)'],
      ['DOCTOR_NAME', 'VARCHAR(128)'], ['STATUS', 'VARCHAR(32)'], ['REASON', 'VARCHAR(256)'], ['WAIT_TIME_MINUTES', 'DECIMAL(10,1)']],
  },
  FACT_LAB_ORDERS_TAT: {
    pk: 'ORDER_ID',
    cols: [['ORDER_ID', 'VARCHAR(64)'], ['PATIENT_ID', 'VARCHAR(64)'], ['TEST_NAME', 'VARCHAR(128)'], ['DEPARTMENT', 'VARCHAR(64)'], ['PRIORITY', 'VARCHAR(16)'],
      ['STATUS', 'VARCHAR(32)'], ['CREATED_AT', 'TIMESTAMP'], ['COLLECTED_AT', 'TIMESTAMP'], ['VERIFIED_AT', 'TIMESTAMP'], ['RELEASED_AT', 'TIMESTAMP'],
      ['TAT_MINUTES', 'DECIMAL(10,1)'], ['SLA_TARGET_MINUTES', 'INT'], ['WITHIN_SLA', 'BOOLEAN'], ['CRITICAL_FLAG_COUNT', 'INT'], ['ABNORMAL_FLAG_COUNT', 'INT']],
  },
  FACT_PHARMACY_PRESCRIPTIONS: {
    pk: 'PRESCRIPTION_ID, MEDICINE_NAME',
    cols: [['PRESCRIPTION_ID', 'VARCHAR(64)'], ['PATIENT_ID', 'VARCHAR(64)'], ['DOCTOR_NAME', 'VARCHAR(128)'], ['PRESCRIBED_DATE', 'DATE'], ['MEDICINE_NAME', 'VARCHAR(256)'],
      ['GENERIC_NAME', 'VARCHAR(256)'], ['FORM', 'VARCHAR(64)'], ['DOSAGE', 'VARCHAR(128)'], ['QUANTITY', 'INT'], ['DURATION_DAYS', 'INT'],
      ['ALLERGY_ALERT_TRIGGERED', 'BOOLEAN'], ['DUPLICATE_OVERRIDE', 'BOOLEAN']],
  },
};

/**
 * Creates the schema and tables when missing, and adds or widens columns on tables created by an older version.
 * CREATE ... IF NOT EXISTS alone would leave an old table untouched.
 */
export async function initializeExasolSchema(): Promise<void> {
  const schema = schemaName();
  await queryExasol(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await queryExasol(`OPEN SCHEMA ${schema}`);
  for (const [table, def] of Object.entries(TABLES)) {
    await queryExasol(`CREATE TABLE IF NOT EXISTS ${table} (${def.cols.map(([n, t]) => `${n} ${t}`).join(', ')}, PRIMARY KEY (${def.pk}))`);
    const have = new Map((await queryExasol<any>(
      `SELECT COLUMN_NAME AS "n", COLUMN_TYPE AS "t" FROM EXA_ALL_COLUMNS WHERE COLUMN_SCHEMA = '${schema}' AND COLUMN_TABLE = '${table}'`
    )).map((r) => [String(r.n), String(r.t)]));
    for (const [name, type] of def.cols) {
      if (!have.has(name)) await queryExasol(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
      else if (name === 'TAT_MINUTES' || name === 'WAIT_TIME_MINUTES') {
        if (/^DECIMAL\(\d+,0\)$/.test(have.get(name)!) || have.get(name) === 'INTEGER') await queryExasol(`ALTER TABLE ${table} MODIFY COLUMN ${name} ${type}`);
      }
    }
  }
}
