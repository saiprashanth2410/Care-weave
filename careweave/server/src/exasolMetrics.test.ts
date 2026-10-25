import { test } from 'node:test';
import assert from 'node:assert/strict';
import { departmentFor, deriveLabOrders, deriveRx, deriveVisits } from './exasol/derive.js';
import * as m from './exasol/metrics.js';
import { getAnalyticsOverview } from './exasol/queries.js';

const T = (min: number) => new Date(Date.UTC(2026, 9, 25, 9, min)).toISOString();

test('lab turnaround exists only for verified orders, and is never invented for the rest', () => {
  const rows = deriveLabOrders([
    { id: 'a', status: 'released', priority: 'routine', testName: 'CBC', orderedAt: T(0), verifiedAt: T(95) },
    { id: 'b', status: 'processing', priority: 'routine', testName: 'CBC', orderedAt: T(0) },
    { id: 'c', status: 'verified', priority: 'urgent', testName: 'Troponin', orderedAt: T(0) },            // verified but no timestamp
    { id: 'd', status: 'released', priority: 'urgent', testName: 'Troponin', orderedAt: T(60), verifiedAt: T(10) }, // timestamps out of order
  ]);
  assert.deepEqual(rows.map((r) => r.tatMinutes), [95, null, null, null]);
  assert.deepEqual(rows.map((r) => r.withinSla), [true, null, null, null]);
  const cbc = m.labTat(rows).find((l) => l.testName === 'CBC')!;
  assert.equal(cbc.avgTatMinutes, 95);
  assert.equal(cbc.pendingOrders, 1);
  assert.equal(cbc.withinSlaPercent, 100);
  const trop = m.labTat(rows).find((l) => l.testName === 'Troponin')!;
  assert.equal(trop.avgTatMinutes, null);
  assert.equal(trop.withinSlaPercent, null);
});

test('SLA compliance uses the priority target', () => {
  const rows = deriveLabOrders([
    { id: 'a', status: 'released', priority: 'urgent', testName: 'X', orderedAt: T(0), verifiedAt: T(40) },
    { id: 'b', status: 'released', priority: 'urgent', testName: 'X', orderedAt: T(0), verifiedAt: T(50) },
  ]);
  assert.equal(m.labTat(rows)[0].withinSlaPercent, 50);
});

test('waiting time needs both check-in and consultation start', () => {
  const rows = deriveVisits([
    { id: '1', date: '2026-10-25', reason: 'Chest pain', status: 'Completed', checkedInAt: T(0), startedAt: T(12) },
    { id: '2', date: '2026-10-25', reason: 'Fever', status: 'Completed', checkedInAt: T(0) },
    { id: '3', date: 'not a date', status: 'Scheduled' },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.waitMinutes), [12, null]);
  assert.equal(m.departmentWorkload(rows).find((d) => d.department === 'Cardiology')!.avgWaitMinutes, 12);
  assert.equal(m.departmentWorkload(rows).find((d) => d.department === 'General Medicine')!.avgWaitMinutes, null);
  assert.equal(departmentFor('Diabetes review'), 'Endocrinology');
});

test('prescription quantity is an estimate from doses per day and duration, null when either is missing', () => {
  const rows = deriveRx([
    { id: 'r1', medicine: 'Augmentin 625 (amoxicillin + clavulanic acid) oral tablet', frequency: 'Twice daily', duration: '5 days', date: T(0), patientId: 'p' },
    { id: 'r2', medicine: 'Metformin HCl', frequency: 'Twice daily', duration: '', date: T(0), patientId: 'p' },
  ]);
  assert.equal(rows[0].quantity, 10);
  assert.equal(rows[0].genericName, 'amoxicillin + clavulanic acid');
  assert.equal(rows[1].quantity, null);
});

test('demand forecast is units divided by observed days (at least 7), carried 30 days', () => {
  const rows = deriveRx([
    { id: 'r1', medicine: 'Metformin HCl', frequency: 'Twice daily', duration: '10 days', date: '2026-10-01T00:00:00Z' },   // 20 units
    { id: 'r2', medicine: 'Metformin HCl', frequency: 'Once daily', duration: '10 days', date: '2026-10-20T00:00:00Z' },    // 10 units
  ]);
  const [metformin] = m.pharmacyConsumption(rows);
  assert.equal(metformin.observationDays, 20);        // 1 Oct to 20 Oct
  assert.equal(metformin.totalQuantityPrescribed, 30);
  assert.equal(metformin.avgDailyUnits, 1.5);
  assert.equal(metformin.projectedDemand30d, 45);
  assert.equal(m.pharmacyConsumption(rows.slice(0, 1))[0].observationDays, 7); // one day of history is not a trend
});

test('percentile matches the linear-interpolated definition', () => {
  assert.equal(m.percentile([10, 20, 30, 40], 0.9), 37);
  assert.equal(m.percentile([], 0.9), null);
});

test('safety counts come from the audit trail and prescription records', () => {
  const db = { auditLogs: [
    { action: 'blocked', entity: 'prescription', detail: 'Allergy conflict' },
    { action: 'blocked', entity: 'prescription', detail: 'Duplicate therapy: x repeats y' },
    { action: 'blocked', entity: 'labOrder', detail: 'Maker-checker: self verification' },
    { action: 'update', entity: 'labOrder', detail: 'Maker-checker mentioned in a normal edit' },
  ] };
  const rx = deriveRx([{ id: 'r', medicine: 'Metformin HCl', frequency: 'Once daily', duration: '5 days', date: T(0), allergyOverrideReason: 'ok', duplicateOverride: { reason: 'x' } }]);
  const s = m.safety(db, [], rx);
  assert.deepEqual([s.allergyBlocks, s.duplicateTherapyBlocks, s.makerCheckerBlocks, s.allergyOverrides, s.duplicateTherapyOverrides], [1, 1, 1, 1, 1]);
});

test('with Exasol unreachable the overview says so, and invents nothing for an empty store', async () => {
  const prev = process.env.EXASOL_PORT; process.env.EXASOL_PORT = '1'; process.env.EXASOL_HOST = '127.0.0.1';
  try {
    const o = await getAnalyticsOverview({ patients: [], appointments: [], labOrders: [], prescriptions: [], auditLogs: [] });
    assert.equal(o.source.live, false);
    assert.match(o.status.engine, /offline/);
    assert.equal(o.visitsTrend.length, 0);
    assert.equal(o.labTat.length, 0);
    assert.equal(o.pharmacyConsumption.length, 0);
    assert.equal(o.summary.avgLabTatMinutes, null);
    assert.equal(o.summary.topPrescribedMedicine, null);
    assert.ok(o.queries.every((q) => q.engine === 'application-store'));
  } finally { prev === undefined ? delete process.env.EXASOL_PORT : (process.env.EXASOL_PORT = prev); }
});

import { analyticsInput, generateSampleHistory } from './exasol/sampleHistory.js';

test('sample history is reproducible, labelled synthetic, and kept out of the real collections', () => {
  const day = new Date(Date.UTC(2026, 9, 25));
  const a = generateSampleHistory(day), b = generateSampleHistory(day);
  assert.deepEqual(a, b);
  assert.ok(a.length > 300);
  assert.ok(a.every((h) => h.record.synthetic === true && h.id.startsWith('SYN-')));
  assert.equal(new Set(a.map((h) => h.id)).size, a.length);
  const db = { appointments: [{ id: 'real' }], labOrders: [], prescriptions: [], syntheticHistory: a };
  const input = analyticsInput(db);
  assert.equal(db.appointments.length, 1);                       // the portals' own collection is untouched
  assert.equal(input.syntheticRecords, a.length);
  assert.equal(input.appointments.length, 1 + a.filter((h) => h.kind === 'appointment').length);
});

test('sample history gives the dashboard real shape: waits differ by department, some orders are still pending', () => {
  const input = analyticsInput({ syntheticHistory: generateSampleHistory(new Date(Date.UTC(2026, 9, 25))) });
  const visits = deriveVisits(input.appointments);
  const dept = m.departmentWorkload(visits);
  const cardio = dept.find((d) => d.department === 'Cardiology')!, general = dept.find((d) => d.department === 'General Medicine')!;
  assert.ok(cardio.avgWaitMinutes! > general.avgWaitMinutes!);
  const labs = deriveLabOrders(input.labOrders);
  assert.ok(labs.some((l) => l.tatMinutes === null) && labs.some((l) => l.tatMinutes !== null));
});

test('no turnaround is produced from a missing or misleading release time', () => {
  const rows = deriveLabOrders([
    { id: '1', status: 'released', testName: 'X', orderedAt: T(0) },                                   // released, no verify/release time at all
    { id: '2', status: 'processing', testName: 'X', orderedAt: T(0), releasedAt: T(30), verifiedAt: T(30) }, // not finished, even if a stray time exists
    { id: '3', status: 'awaiting_verification', testName: 'X', orderedAt: T(0), approvedAt: T(20) },
    { id: '4', status: 'released', testName: 'X', verifiedAt: T(50) },                                   // no ordered time
    { id: '5', status: 'released', testName: 'X', orderedAt: 'garbage', verifiedAt: T(50) },
    { id: '6', status: 'released', testName: 'X', orderedAt: T(0), verifiedAt: T(45) },                  // the only genuine one
  ]);
  assert.deepEqual(rows.map((r) => r.tatMinutes), [null, null, null, null, null, 45]);
  assert.deepEqual(rows.map((r) => r.releasedAt), [null, null, null, null, null, null]); // never copied from verifiedAt
  const [x] = m.labTat(rows);
  assert.equal(x.completedOrders, 1);
  assert.equal(x.pendingOrders, 5);
  assert.equal(x.avgTatMinutes, 45);   // the five unmeasurable orders do not pull the average toward zero or now
});
