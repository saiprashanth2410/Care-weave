import { queryExasol, pingExasol, updateSyncTelemetry } from './client.js';
import { initializeExasolSchema } from './schema.js';

// Escape string literal for safe SQL insert
function sqlStr(str: any): string {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
}

function sqlDate(dateStr: any): string {
  if (!dateStr) return 'CURRENT_DATE';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'CURRENT_DATE';
  return `'${d.toISOString().split('T')[0]}'`;
}

function sqlTimestamp(dateStr: any): string {
  if (!dateStr) return 'NULL';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'NULL';
  return `'${d.toISOString().replace('T', ' ').substring(0, 19)}'`;
}

export interface SyncResult {
  success: boolean;
  engine: string;
  syncedVisits: number;
  syncedLabOrders: number;
  syncedPrescriptions: number;
  timestamp: string;
  error?: string;
}

/**
 * Idempotently synchronizes application data into Exasol analytics tables.
 * Uses MERGE (upsert) to safely avoid duplicates upon repeated executions.
 */
export async function syncDataToExasol(db: any): Promise<SyncResult> {
  const timestamp = new Date().toISOString();
  const appointments: any[] = db?.appointments || [];
  const labOrders: any[] = db?.labOrders || [];
  const prescriptions: any[] = db?.prescriptions || [];
  const auditLogs: any[] = db?.auditLogs || [];

  const isExasolLive = await pingExasol();

  if (!isExasolLive) {
    // If Exasol is offline, we record the telemetry and let the fallback queries operate directly on MongoDB data
    const totalCount = appointments.length + labOrders.length + prescriptions.length;
    updateSyncTelemetry(totalCount);
    return {
      success: true,
      engine: 'MongoDB Analytics Pipeline (Exasol Offline)',
      syncedVisits: appointments.length,
      syncedLabOrders: labOrders.length,
      syncedPrescriptions: prescriptions.length,
      timestamp,
    };
  }

  try {
    await initializeExasolSchema();

    let visitCount = 0;
    let labCount = 0;
    let prescriptionCount = 0;

    // 1. Sync Visits to FACT_PATIENT_VISITS via MERGE
    for (const appt of appointments) {
      const waitMinutes = appt.checkedInAt
        ? Math.max(5, Math.round((Date.now() - new Date(appt.checkedInAt).getTime()) / 60000))
        : 15;
      const dept = appt.reason?.toLowerCase().includes('heart') || appt.reason?.toLowerCase().includes('cardio')
        ? 'Cardiology'
        : appt.reason?.toLowerCase().includes('sugar') || appt.reason?.toLowerCase().includes('diabet')
        ? 'Endocrinology'
        : 'General Medicine';

      const mergeSql = `
        MERGE INTO FACT_PATIENT_VISITS target
        USING (
          SELECT
            ${sqlStr(appt.id)} AS VISIT_ID,
            ${sqlStr(appt.patientId || appt.patientIdCode)} AS PATIENT_ID,
            ${sqlDate(appt.date)} AS VISIT_DATE,
            ${sqlStr(appt.time || '09:00')} AS VISIT_TIME,
            ${sqlStr(dept)} AS DEPARTMENT,
            ${sqlStr(appt.doctorName || 'Dr. Anirban Laha')} AS DOCTOR_NAME,
            ${sqlStr(appt.status || 'scheduled')} AS STATUS,
            ${sqlStr(appt.reason || 'General Consultation')} AS REASON,
            ${waitMinutes} AS WAIT_TIME_MINUTES
        ) src ON target.VISIT_ID = src.VISIT_ID
        WHEN MATCHED THEN
          UPDATE SET target.STATUS = src.STATUS, target.WAIT_TIME_MINUTES = src.WAIT_TIME_MINUTES
        WHEN NOT MATCHED THEN
          INSERT (VISIT_ID, PATIENT_ID, VISIT_DATE, VISIT_TIME, DEPARTMENT, DOCTOR_NAME, STATUS, REASON, WAIT_TIME_MINUTES)
          VALUES (src.VISIT_ID, src.PATIENT_ID, src.VISIT_DATE, src.VISIT_TIME, src.DEPARTMENT, src.DOCTOR_NAME, src.STATUS, src.REASON, src.WAIT_TIME_MINUTES);
      `;
      await queryExasol(mergeSql);
      visitCount++;
    }

    // 2. Sync Lab Orders to FACT_LAB_ORDERS_TAT via MERGE
    for (const order of labOrders) {
      const isUrgent = order.priority === 'urgent';
      const slaTarget = isUrgent ? 45 : 120; // 45 min urgent SLA, 120 min routine SLA
      const created = order.createdAt ? new Date(order.createdAt).getTime() : Date.now();
      const released = order.releasedAt ? new Date(order.releasedAt).getTime() : Date.now();
      const tatMinutes = Math.max(10, Math.round((released - created) / 60000));
      const withinSla = tatMinutes <= slaTarget;

      const criticalFlags = Array.isArray(order.results)
        ? order.results.filter((r: any) => r.flag === 'critical' || r.flag === 'abnormal').length
        : 0;

      const mergeSql = `
        MERGE INTO FACT_LAB_ORDERS_TAT target
        USING (
          SELECT
            ${sqlStr(order.id)} AS ORDER_ID,
            ${sqlStr(order.patientId)} AS PATIENT_ID,
            ${sqlStr(order.testName || 'Comprehensive Panel')} AS TEST_NAME,
            ${sqlStr(order.department || 'Biochemistry')} AS DEPARTMENT,
            ${sqlStr(order.priority || 'routine')} AS PRIORITY,
            ${sqlStr(order.status || 'requested')} AS STATUS,
            ${sqlTimestamp(order.createdAt)} AS CREATED_AT,
            ${sqlTimestamp(order.collectedAt)} AS COLLECTED_AT,
            ${sqlTimestamp(order.verifiedAt)} AS VERIFIED_AT,
            ${sqlTimestamp(order.releasedAt)} AS RELEASED_AT,
            ${tatMinutes} AS TAT_MINUTES,
            ${slaTarget} AS SLA_TARGET_MINUTES,
            ${withinSla ? 'TRUE' : 'FALSE'} AS WITHIN_SLA,
            ${criticalFlags} AS CRITICAL_FLAG_COUNT
        ) src ON target.ORDER_ID = src.ORDER_ID
        WHEN MATCHED THEN
          UPDATE SET target.STATUS = src.STATUS, target.VERIFIED_AT = src.VERIFIED_AT, target.RELEASED_AT = src.RELEASED_AT, target.TAT_MINUTES = src.TAT_MINUTES, target.WITHIN_SLA = src.WITHIN_SLA
        WHEN NOT MATCHED THEN
          INSERT (ORDER_ID, PATIENT_ID, TEST_NAME, DEPARTMENT, PRIORITY, STATUS, CREATED_AT, COLLECTED_AT, VERIFIED_AT, RELEASED_AT, TAT_MINUTES, SLA_TARGET_MINUTES, WITHIN_SLA, CRITICAL_FLAG_COUNT)
          VALUES (src.ORDER_ID, src.PATIENT_ID, src.TEST_NAME, src.DEPARTMENT, src.PRIORITY, src.STATUS, src.CREATED_AT, src.COLLECTED_AT, src.VERIFIED_AT, src.RELEASED_AT, src.TAT_MINUTES, src.SLA_TARGET_MINUTES, src.WITHIN_SLA, src.CRITICAL_FLAG_COUNT);
      `;
      await queryExasol(mergeSql);
      labCount++;
    }

    // 3. Sync Prescriptions to FACT_PHARMACY_PRESCRIPTIONS
    for (const rx of prescriptions) {
      const meds: any[] = rx.medications || [];
      const hasAllergyIntercept = auditLogs.some(
        (a: any) => a.action === 'allergy-blocked' && (a.entityId === rx.id || a.entityId === rx.patientId)
      );

      for (const med of meds) {
        const mergeSql = `
          MERGE INTO FACT_PHARMACY_PRESCRIPTIONS target
          USING (
            SELECT
              ${sqlStr(rx.id)} AS PRESCRIPTION_ID,
              ${sqlStr(rx.patientId)} AS PATIENT_ID,
              ${sqlStr(rx.doctorName || 'Dr. Anirban Laha')} AS DOCTOR_NAME,
              ${sqlDate(rx.createdAt)} AS PRESCRIBED_DATE,
              ${sqlStr(med.name || med.brand || 'Medication')} AS MEDICINE_NAME,
              ${sqlStr(med.generic || 'Generic Formulation')} AS GENERIC_NAME,
              ${sqlStr(med.form || 'Tablet')} AS FORM,
              ${sqlStr(med.dosage || '500mg')} AS DOSAGE,
              ${Number(med.quantity || 10)} AS QUANTITY,
              ${Number(med.durationDays || 5)} AS DURATION_DAYS,
              ${hasAllergyIntercept ? 'TRUE' : 'FALSE'} AS ALLERGY_ALERT_TRIGGERED
          ) src ON target.PRESCRIPTION_ID = src.PRESCRIPTION_ID AND target.MEDICINE_NAME = src.MEDICINE_NAME
          WHEN MATCHED THEN
            UPDATE SET target.QUANTITY = src.QUANTITY
          WHEN NOT MATCHED THEN
            INSERT (PRESCRIPTION_ID, PATIENT_ID, DOCTOR_NAME, PRESCRIBED_DATE, MEDICINE_NAME, GENERIC_NAME, FORM, DOSAGE, QUANTITY, DURATION_DAYS, ALLERGY_ALERT_TRIGGERED)
            VALUES (src.PRESCRIPTION_ID, src.PATIENT_ID, src.DOCTOR_NAME, src.PRESCRIBED_DATE, src.MEDICINE_NAME, src.GENERIC_NAME, src.FORM, src.DOSAGE, src.QUANTITY, src.DURATION_DAYS, src.ALLERGY_ALERT_TRIGGERED);
        `;
        await queryExasol(mergeSql);
        prescriptionCount++;
      }
    }

    const totalSynced = visitCount + labCount + prescriptionCount;
    updateSyncTelemetry(totalSynced);

    return {
      success: true,
      engine: 'Exasol In-Memory Columnar (Live)',
      syncedVisits: visitCount,
      syncedLabOrders: labCount,
      syncedPrescriptions: prescriptionCount,
      timestamp,
    };
  } catch (err: any) {
    console.error('[Exasol Sync Error]:', err);
    return {
      success: false,
      engine: 'Exasol In-Memory Columnar',
      syncedVisits: 0,
      syncedLabOrders: 0,
      syncedPrescriptions: 0,
      timestamp,
      error: err?.message || 'Sync failed',
    };
  }
}

