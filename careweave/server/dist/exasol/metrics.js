// The same metrics the Exasol SQL computes, worked out in memory from the same derived rows.
// Used when Exasol is unreachable, and in tests to check the SQL and the code agree.
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** Linear-interpolated percentile, the same definition as Exasol's PERCENTILE_CONT. */
export function percentile(xs, p) {
    if (!xs.length)
        return null;
    const s = [...xs].sort((a, b) => a - b);
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
export function visitsTrend(rows) {
    const byDate = new Map();
    for (const v of rows) {
        const d = byDate.get(v.visitDate) ?? { date: v.visitDate, totalVisits: 0, completed: 0, inClinic: 0, scheduled: 0, cancelled: 0, movingAvg7: 0 };
        d.totalVisits++;
        if (v.status === 'completed')
            d.completed++;
        else if (['checked-in', 'waiting', 'in-consultation'].includes(v.status))
            d.inClinic++;
        else if (v.status === 'scheduled')
            d.scheduled++;
        else if (['cancelled', 'no-show'].includes(v.status))
            d.cancelled++;
        byDate.set(v.visitDate, d);
    }
    const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    days.forEach((d, i) => { d.movingAvg7 = round(avg(days.slice(Math.max(0, i - 6), i + 1).map((x) => x.totalVisits))); });
    return days.slice(-30);
}
export function departmentWorkload(rows) {
    const m = new Map();
    for (const v of rows)
        m.set(v.department, [...(m.get(v.department) ?? []), v]);
    return [...m.entries()].map(([department, vs]) => {
        const waits = vs.map((v) => v.waitMinutes).filter((w) => w !== null);
        return { department, visitCount: vs.length, avgWaitMinutes: avg(waits) === null ? null : round(avg(waits)), waitSamples: waits.length, activeDoctors: new Set(vs.map((v) => v.doctorName)).size };
    }).sort((a, b) => b.visitCount - a.visitCount);
}
export function labTat(rows) {
    const m = new Map();
    for (const o of rows)
        m.set(`${o.testName}|${o.department}|${o.priority}`, [...(m.get(`${o.testName}|${o.department}|${o.priority}`) ?? []), o]);
    return [...m.values()].map((os) => {
        const done = os.filter((o) => o.tatMinutes !== null);
        const tats = done.map((o) => o.tatMinutes);
        return {
            testName: os[0].testName, department: os[0].department, priority: os[0].priority,
            totalOrders: os.length, completedOrders: done.length, pendingOrders: os.length - done.length,
            avgTatMinutes: avg(tats) === null ? null : round(avg(tats)),
            p90TatMinutes: percentile(tats, 0.9) === null ? null : round(percentile(tats, 0.9)),
            slaTargetMinutes: os[0].slaTargetMinutes,
            withinSlaPercent: done.length ? round((done.filter((o) => o.withinSla).length * 100) / done.length) : null,
            criticalCount: os.reduce((n, o) => n + o.criticalFlagCount, 0),
        };
    }).sort((a, b) => b.totalOrders - a.totalOrders).slice(0, 15);
}
export function labStages(rows) {
    const gap = (a, b) => (a && b ? (Date.parse(b.replace(' ', 'T') + 'Z') - Date.parse(a.replace(' ', 'T') + 'Z')) / 60000 : null);
    const toCollect = rows.map((o) => gap(o.orderedAt, o.collectedAt)).filter((x) => x !== null && x >= 0);
    const toVerify = rows.map((o) => gap(o.collectedAt, o.verifiedAt)).filter((x) => x !== null && x >= 0);
    return {
        orderToCollectMinutes: avg(toCollect) === null ? null : round(avg(toCollect)), orderToCollectSamples: toCollect.length,
        collectToVerifyMinutes: avg(toVerify) === null ? null : round(avg(toVerify)), collectToVerifySamples: toVerify.length,
    };
}
const dayNum = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / 86400000);
/** Days of prescribing history used to turn totals into a daily rate. At least 7, so a single busy day does not look like a trend. */
export function observationDays(rows) {
    if (!rows.length)
        return 7;
    const days = rows.map((r) => dayNum(r.prescribedDate));
    return Math.max(7, Math.max(...days) - Math.min(...days) + 1);
}
export function pharmacyConsumption(rows) {
    const window = observationDays(rows);
    const m = new Map();
    for (const r of rows)
        m.set(r.medicineName, [...(m.get(r.medicineName) ?? []), r]);
    return [...m.entries()].map(([medicineName, rs]) => {
        const known = rs.filter((r) => r.quantity !== null);
        const total = known.reduce((n, r) => n + r.quantity, 0);
        return {
            medicineName, genericName: rs[0].genericName, form: rs[0].form || '—',
            totalQuantityPrescribed: known.length ? total : null, prescriptionCount: rs.length, unknownQuantityCount: rs.length - known.length,
            avgDailyUnits: known.length ? round(total / window, 2) : null,
            projectedDemand30d: known.length ? Math.round((total / window) * 30) : null,
            observationDays: window,
        };
    }).sort((a, b) => (b.totalQuantityPrescribed ?? -1) - (a.totalQuantityPrescribed ?? -1) || b.prescriptionCount - a.prescriptionCount).slice(0, 15);
}
/** Safety counts come from the application's audit trail and prescription records, because blocked attempts never reach Exasol. */
export function safety(db, labRows, rxRows) {
    const logs = db?.auditLogs || [];
    const blocked = (entity, prefix) => logs.filter((l) => l.action === 'blocked' && l.entity === entity && String(l.detail).startsWith(prefix)).length;
    return {
        totalPrescriptions: new Set(rxRows.map((r) => r.prescriptionId)).size,
        allergyBlocks: blocked('prescription', 'Allergy conflict'),
        allergyOverrides: new Set(rxRows.filter((r) => r.allergyOverride).map((r) => r.prescriptionId)).size,
        duplicateTherapyBlocks: blocked('prescription', 'Duplicate therapy'),
        duplicateTherapyOverrides: new Set(rxRows.filter((r) => r.duplicateOverride).map((r) => r.prescriptionId)).size,
        makerCheckerBlocks: blocked('labOrder', 'Maker-checker'),
        criticalLabResults: labRows.reduce((n, o) => n + o.criticalFlagCount, 0),
    };
}
