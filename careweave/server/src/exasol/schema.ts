import { queryExasol } from './client.js';

export const EXASOL_SCHEMA_DDL = `
CREATE SCHEMA IF NOT EXISTS CAREWEAVE_ANALYTICS;
OPEN SCHEMA CAREWEAVE_ANALYTICS;

-- 1. Fact table: Outpatient Visits & Wait-Time Funnel
CREATE TABLE IF NOT EXISTS FACT_PATIENT_VISITS (
  VISIT_ID VARCHAR(64) PRIMARY KEY,
  PATIENT_ID VARCHAR(64),
  VISIT_DATE DATE,
  VISIT_TIME VARCHAR(16),
  DEPARTMENT VARCHAR(64),
  DOCTOR_NAME VARCHAR(128),
  STATUS VARCHAR(32),
  REASON VARCHAR(256),
  WAIT_TIME_MINUTES INT,
  CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Fact table: Diagnostic Laboratory Orders & Turnaround Time (TAT)
CREATE TABLE IF NOT EXISTS FACT_LAB_ORDERS_TAT (
  ORDER_ID VARCHAR(64) PRIMARY KEY,
  PATIENT_ID VARCHAR(64),
  TEST_NAME VARCHAR(128),
  DEPARTMENT VARCHAR(64),
  PRIORITY VARCHAR(16),
  STATUS VARCHAR(32),
  CREATED_AT TIMESTAMP,
  COLLECTED_AT TIMESTAMP,
  VERIFIED_AT TIMESTAMP,
  RELEASED_AT TIMESTAMP,
  TAT_MINUTES INT,
  SLA_TARGET_MINUTES INT,
  WITHIN_SLA BOOLEAN,
  CRITICAL_FLAG_COUNT INT
);

-- 3. Fact table: Pharmacy Prescriptions & Drug Consumption
CREATE TABLE IF NOT EXISTS FACT_PHARMACY_PRESCRIPTIONS (
  PRESCRIPTION_ID VARCHAR(64),
  PATIENT_ID VARCHAR(64),
  DOCTOR_NAME VARCHAR(128),
  PRESCRIBED_DATE DATE,
  MEDICINE_NAME VARCHAR(256),
  GENERIC_NAME VARCHAR(256),
  FORM VARCHAR(64),
  DOSAGE VARCHAR(64),
  QUANTITY INT,
  DURATION_DAYS INT,
  ALLERGY_ALERT_TRIGGERED BOOLEAN,
  PRIMARY KEY (PRESCRIPTION_ID, MEDICINE_NAME)
);

-- 4. Dimension table: Drug Formulary & Inventory Baselines
CREATE TABLE IF NOT EXISTS DIM_MEDICINES (
  MEDICINE_ID VARCHAR(64) PRIMARY KEY,
  BRAND_NAME VARCHAR(256),
  GENERIC_NAME VARCHAR(256),
  FORM VARCHAR(64),
  STRENGTH VARCHAR(64),
  STOCK_ON_HAND INT DEFAULT 500,
  REORDER_THRESHOLD INT DEFAULT 100
);
`;

/**
 * Executes DDL statements in Exasol to prepare the analytical tables.
 */
export async function initializeExasolSchema(): Promise<boolean> {
  try {
    const statements = EXASOL_SCHEMA_DDL.split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      await queryExasol(stmt + ';');
    }
    console.log('[Exasol]: Schema CAREWEAVE_ANALYTICS and analytical tables verified.');
    return true;
  } catch (err: any) {
    console.warn('[Exasol Schema Initialization Failed]:', err?.message || err);
    return false;
  }
}
