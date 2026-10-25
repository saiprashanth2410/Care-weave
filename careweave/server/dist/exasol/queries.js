import { queryExasol, getAnalyticsEngineStatus } from './client.js';
import { deriveLabOrders, deriveRx, deriveVisits } from './derive.js';
import * as fallback from './metrics.js';
import { analyticsInput } from './sampleHistory.js';
const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const n0 = (v) => Number(v ?? 0);
/** The analytical SQL. Exposed so the SQL Inspector shows exactly what runs, not a copy that can drift. */
export const SQL = {
    visits: `SELECT * FROM (
  SELECT TO_CHAR(d.VISIT_DATE, 'YYYY-MM-DD') AS "date", d.TOTAL AS "totalVisits", d.COMPLETED AS "completed", d.IN_CLINIC AS "inClinic",
         d.SCHEDULED AS "scheduled", d.CANCELLED AS "cancelled",
         ROUND(AVG(d.TOTAL) OVER (ORDER BY d.VISIT_DATE ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS "movingAvg7"
  FROM (
    SELECT VISIT_DATE, COUNT(*) AS TOTAL,
           COUNT(CASE WHEN STATUS = 'completed' THEN 1 END) AS COMPLETED,
           COUNT(CASE WHEN STATUS IN ('checked-in', 'waiting', 'in-consultation') THEN 1 END) AS IN_CLINIC,
           COUNT(CASE WHEN STATUS = 'scheduled' THEN 1 END) AS SCHEDULED,
           COUNT(CASE WHEN STATUS IN ('cancelled', 'no-show') THEN 1 END) AS CANCELLED
    FROM FACT_PATIENT_VISITS GROUP BY VISIT_DATE
  ) d
) ORDER BY "date" DESC LIMIT 30`,
    departments: `SELECT DEPARTMENT AS "department", COUNT(*) AS "visitCount",
       ROUND(AVG(WAIT_TIME_MINUTES), 1) AS "avgWaitMinutes", COUNT(WAIT_TIME_MINUTES) AS "waitSamples",
       COUNT(DISTINCT DOCTOR_NAME) AS "activeDoctors"
FROM FACT_PATIENT_VISITS
GROUP BY DEPARTMENT
ORDER BY "visitCount" DESC`,
    labTat: `SELECT TEST_NAME AS "testName", DEPARTMENT AS "department", PRIORITY AS "priority",
       COUNT(*) AS "totalOrders", COUNT(TAT_MINUTES) AS "completedOrders",
       ROUND(AVG(TAT_MINUTES), 1) AS "avgTatMinutes",
       ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY TAT_MINUTES), 1) AS "p90TatMinutes",
       MAX(SLA_TARGET_MINUTES) AS "slaTargetMinutes",
       ROUND(100 * COUNT(CASE WHEN WITHIN_SLA THEN 1 END) / NULLIF(COUNT(TAT_MINUTES), 0), 1) AS "withinSlaPercent",
       SUM(CRITICAL_FLAG_COUNT) AS "criticalCount"
FROM FACT_LAB_ORDERS_TAT
GROUP BY TEST_NAME, DEPARTMENT, PRIORITY
ORDER BY "totalOrders" DESC LIMIT 15`,
    labStages: `SELECT ROUND(AVG(CASE WHEN COLLECTED_AT >= CREATED_AT THEN SECONDS_BETWEEN(COLLECTED_AT, CREATED_AT) / 60 END), 1) AS "orderToCollectMinutes",
       COUNT(CASE WHEN COLLECTED_AT >= CREATED_AT THEN 1 END) AS "orderToCollectSamples",
       ROUND(AVG(CASE WHEN VERIFIED_AT >= COLLECTED_AT THEN SECONDS_BETWEEN(VERIFIED_AT, COLLECTED_AT) / 60 END), 1) AS "collectToVerifyMinutes",
       COUNT(CASE WHEN VERIFIED_AT >= COLLECTED_AT THEN 1 END) AS "collectToVerifySamples"
FROM FACT_LAB_ORDERS_TAT`,
    pharmacy: `SELECT p.MEDICINE_NAME AS "medicineName", MAX(p.GENERIC_NAME) AS "genericName", MAX(p.FORM) AS "form",
       SUM(p.QUANTITY) AS "totalQuantityPrescribed", COUNT(*) AS "prescriptionCount",
       COUNT(*) - COUNT(p.QUANTITY) AS "unknownQuantityCount",
       ROUND(SUM(p.QUANTITY) / w.DAYS, 2) AS "avgDailyUnits",
       ROUND(SUM(p.QUANTITY) / w.DAYS * 30) AS "projectedDemand30d",
       w.DAYS AS "observationDays"
FROM FACT_PHARMACY_PRESCRIPTIONS p
CROSS JOIN (SELECT GREATEST(7, DAYS_BETWEEN(MAX(PRESCRIBED_DATE), MIN(PRESCRIBED_DATE)) + 1) AS DAYS FROM FACT_PHARMACY_PRESCRIPTIONS) w
GROUP BY p.MEDICINE_NAME, w.DAYS
ORDER BY "totalQuantityPrescribed" DESC NULLS LAST, "prescriptionCount" DESC LIMIT 15`,
    quality: `SELECT (SELECT COUNT(*) FROM FACT_PATIENT_VISITS WHERE WAIT_TIME_MINUTES IS NULL) AS "visitsWithoutWaitTime",
       (SELECT COUNT(*) FROM FACT_LAB_ORDERS_TAT WHERE TAT_MINUTES IS NULL) AS "labOrdersPending",
       (SELECT COUNT(*) FROM FACT_PHARMACY_PRESCRIPTIONS WHERE QUANTITY IS NULL) AS "prescriptionsWithoutQuantity"
FROM DUAL`,
};
const TITLES = {
    visits: 'Daily outpatient volume with a 7-day moving average (window function)',
    departments: 'Department workload and waiting time',
    labTat: 'Lab turnaround vs SLA: average, 90th percentile (PERCENTILE_CONT), SLA compliance',
    labStages: 'Where lab time goes: order to collection, collection to verification',
    pharmacy: 'Prescribing volume and 30-day demand estimate',
    quality: 'Data quality: records that cannot be measured',
};
async function runExasol() {
    const queries = [];
    const run = async (id) => {
        const t = Date.now();
        const rows = await queryExasol(SQL[id]);
        queries.push({ id, title: TITLES[id], sql: SQL[id], engine: 'exasol', rows: rows.length, ms: Date.now() - t });
        return rows;
    };
    const visitsTrend = (await run('visits')).reverse().map((r) => ({
        date: r.date, totalVisits: n0(r.totalvisits), completed: n0(r.completed), inClinic: n0(r.inclinic), scheduled: n0(r.scheduled), cancelled: n0(r.cancelled), movingAvg7: n0(r.movingavg7),
    }));
    const departmentWorkload = (await run('departments')).map((r) => ({
        department: r.department, visitCount: n0(r.visitcount), avgWaitMinutes: n(r.avgwaitminutes), waitSamples: n0(r.waitsamples), activeDoctors: n0(r.activedoctors),
    }));
    const labTat = (await run('labTat')).map((r) => ({
        testName: r.testname, department: r.department, priority: r.priority, totalOrders: n0(r.totalorders), completedOrders: n0(r.completedorders),
        pendingOrders: n0(r.totalorders) - n0(r.completedorders), avgTatMinutes: n(r.avgtatminutes), p90TatMinutes: n(r.p90tatminutes),
        slaTargetMinutes: n0(r.slatargetminutes), withinSlaPercent: n(r.withinslapercent), criticalCount: n0(r.criticalcount),
    }));
    const s = (await run('labStages'))[0] || {};
    const labStages = {
        orderToCollectMinutes: n(s.ordertocollectminutes), orderToCollectSamples: n0(s.ordertocollectsamples),
        collectToVerifyMinutes: n(s.collecttoverifyminutes), collectToVerifySamples: n0(s.collecttoverifysamples),
    };
    const pharmacyConsumption = (await run('pharmacy')).map((r) => ({
        medicineName: r.medicinename, genericName: r.genericname, form: r.form || '—', totalQuantityPrescribed: n(r.totalquantityprescribed),
        prescriptionCount: n0(r.prescriptioncount), unknownQuantityCount: n0(r.unknownquantitycount), avgDailyUnits: n(r.avgdailyunits),
        projectedDemand30d: n(r.projecteddemand30d), observationDays: n0(r.observationdays),
    }));
    const q = (await run('quality'))[0] || {};
    const dataQuality = { visitsWithoutWaitTime: n0(q.visitswithoutwaittime), labOrdersPending: n0(q.laborderspending), prescriptionsWithoutQuantity: n0(q.prescriptionswithoutquantity) };
    return { metrics: { visitsTrend, departmentWorkload, labTat, labStages, pharmacyConsumption, dataQuality }, queries };
}
function runFallback(db) {
    const input = analyticsInput(db);
    const visits = deriveVisits(input.appointments);
    const labs = deriveLabOrders(input.labOrders);
    const rx = deriveRx(input.prescriptions);
    const metrics = {
        visitsTrend: fallback.visitsTrend(visits), departmentWorkload: fallback.departmentWorkload(visits), labTat: fallback.labTat(labs), labStages: fallback.labStages(labs),
        pharmacyConsumption: fallback.pharmacyConsumption(rx),
        dataQuality: { visitsWithoutWaitTime: visits.filter((v) => v.waitMinutes === null).length, labOrdersPending: labs.filter((o) => o.tatMinutes === null).length, prescriptionsWithoutQuantity: rx.filter((r) => r.quantity === null).length },
    };
    const queries = Object.keys(SQL).map((id) => ({
        id, title: TITLES[id], sql: SQL[id], engine: 'application-store', rows: 0, ms: 0,
        note: 'Not executed on Exasol: it is offline. The application computed the same figures in code.',
    }));
    return { metrics, queries, rx, labs };
}
/** Runs the analytics on Exasol when it is reachable. If it is not, or a query fails, the application computes the figures itself and says so. */
export async function getAnalyticsOverview(db) {
    const status = await getAnalyticsEngineStatus();
    const local = runFallback(db);
    let metrics = local.metrics, queries = local.queries;
    let source = { live: false, engine: status.engine, fallbackReason: 'Exasol is not reachable.' };
    if (status.connected) {
        try {
            const r = await runExasol();
            metrics = r.metrics;
            queries = r.queries;
            source = { live: true, engine: status.engine };
        }
        catch (err) {
            source = { live: false, engine: 'Application Store (Exasol offline)', fallbackReason: `Exasol is connected but a query failed (${err?.message || err}). Press Sync to Exasol to create or refresh the tables.` };
        }
    }
    const safety = fallback.safety(db, local.labs, local.rx);
    const done = metrics.labTat.filter((l) => l.avgTatMinutes !== null);
    const doneOrders = done.reduce((a, l) => a + l.completedOrders, 0);
    return {
        status, source: { ...source, syntheticRecords: analyticsInput(db).syntheticRecords },
        summary: {
            totalPatients: db?.patients?.length ?? 0,
            totalVisits: metrics.visitsTrend.reduce((a, v) => a + v.totalVisits, 0),
            avgLabTatMinutes: doneOrders ? Math.round((done.reduce((a, l) => a + l.avgTatMinutes * l.completedOrders, 0) / doneOrders) * 10) / 10 : null,
            criticalAlertsCount: safety.criticalLabResults + safety.allergyBlocks + safety.duplicateTherapyBlocks,
            topPrescribedMedicine: metrics.pharmacyConsumption[0]?.medicineName ?? null,
        },
        ...metrics, safety, queries, generatedAt: new Date().toISOString(),
    };
}
