import type { Repos } from '../repo/index.js';
import { isToday } from '../util.js';
import { linkedPatientIds } from './access.js';

// Shapes the stored records into what the doctor screens show. These are pure functions of the records passed in.

export const STATUS_FOR_DOCTOR: Record<string, string> = {
  requested: 'Requested',
  collection_pending: 'Sample Collection Pending',
  recollect_required: 'Sample Collection Pending',
  collected: 'Sample Collected',
  processing: 'Processing',
  awaiting_verification: 'Awaiting Verification',
  verified: 'Verified',
  released: 'Released to Doctor'
};

const num = (v: any) => {
  const n = Number.parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Imported results count in charts only when nothing about them is waiting for review.
const IMPORT_OK = ['Imported', 'Linked (reviewed)'];

/** Our multi-analyte order -> the shape the doctor screens expect. */
export const doctorLab = (o: any) => {
  const released = ['verified', 'released'].includes(o.status);
  const params: any[] = o.results ?? [];
  const flagged = params.filter((r) => r.flag && r.flag !== 'normal');
  const lead = flagged[0] ?? params[0];
  return {
    id: o.id,
    orderId: o.id,
    patientId: o.registeredPatientRef ?? o.patientId,
    patientName: o.patientName,
    patientIdCode: o.patientId,
    encounterId: o.encounterId,
    testName: o.testName,
    orderingDoctor: o.orderingDoctor,
    requestedAt: o.orderedAt,
    sampleType: o.sampleType ?? '',
    priority: o.priority === 'urgent' ? 'Urgent' : 'Routine',
    clinicalIndication: o.handlingNote ?? '',
    status: STATUS_FOR_DOCTOR[o.status] ?? 'Requested',
    version: o.version,
    amended: (o.amendments ?? []).length,
    // Values only appear once a verifier has signed. Drafts and submitted values stay in the lab.
    result: released && lead
      ? {
          id: `res-${o.id}`,
          orderId: o.id,
          value: params.length > 1 ? `${params.length} analytes${flagged.length ? `, ${flagged.length} flagged` : ''}` : String(lead.value),
          units: params.length > 1 ? '' : String(lead.unit ?? ''),
          referenceRange: params.length > 1 ? 'see parameters' : String(lead.referenceRange ?? ''),
          observedAt: o.observedAt ?? o.verifiedAt ?? o.orderedAt,
          comments: o.pathologistNotes ?? '',
          verifiedBy: o.verifiedBy,
          verifiedAt: o.verifiedAt,
          releasedAt: o.verifiedAt,
          status: STATUS_FOR_DOCTOR[o.status],
          parameters: params
        }
      : undefined
  };
};

/** The orders that belong to a patient, cancelled ones left out. */
export const labsFor = async (repos: Repos, p: any) => (await repos.orders.forPatient(p)).filter((o: any) => o.status !== 'cancelled');

/** Outside records linked to a patient, apart from the ones that never found a patient. */
export const importedFor = async (repos: Repos, p: any) => (await repos.externalRecords.find({ patientId: p.id })).filter((r: any) => r.status !== 'Unmatched');

export function chartPoints(labs: any[], imported: any[]) {
  const points: any[] = [];
  for (const o of labs) {
    if (!['verified', 'released'].includes(o.status)) continue;
    for (const r of o.results ?? []) {
      const v = num(r.value);
      if (v === null) continue;
      points.push({ date: o.observedAt ?? o.verifiedAt ?? o.orderedAt, value: v, units: r.unit ?? '', range: r.referenceRange ?? '', test: r.parameter, status: 'Released to Doctor', source: 'CareWeave Laboratory' });
    }
  }
  for (const r of imported) {
    if (r.kind !== 'lab' || !IMPORT_OK.includes(r.status)) continue;
    const v = num(r.content?.value);
    if (v === null) continue;
    points.push({ date: r.eventDate, value: v, units: r.content.units ?? '', range: r.content.referenceRange ?? '', test: r.content.testName, status: 'Imported', source: r.facility });
  }
  return points.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export const summarize = (r: any) => {
  const x = r.content ?? {};
  return r.kind === 'lab' ? `${x.testName ?? 'Test'}: ${x.value ?? '?'} ${x.units ?? ''}`.trim() + ` · ${r.status}`
    : r.kind === 'medication' ? `${x.medicine ?? 'Medicine'} ${x.dosage ?? ''} ${x.frequency ?? ''}`.replace(/\s+/g, ' ').trim() + ` · ${r.status}`
    : `${x.diagnosis ?? 'Consultation'} · ${r.status}`;
};

export function timeline(d: { encounters: any[]; labs: any[]; prescriptions: any[]; imported: any[]; referrals: any[]; vitals: any[] }) {
  const ev: any[] = [];
  for (const e of d.encounters)
    ev.push({ id: e.id, type: 'Consultation', date: e.date, title: e.diagnosis || 'Clinical consultation', detail: e.notes || e.assessment || 'Encounter recorded in CareWeave.', source: e.source || 'CareWeave Clinic', reference: e.id, imported: false });
  for (const o of d.labs) {
    const l = doctorLab(o);
    const flagged = (o.results ?? []).filter((r: any) => r.flag && r.flag !== 'normal').map((r: any) => r.parameter);
    ev.push({
      id: o.id, type: 'Lab result', date: o.observedAt ?? o.orderedAt, title: o.testName,
      detail: l.result ? `${l.result.value}${l.result.units ? ' ' + l.result.units : ''}${flagged.length ? ` · flagged: ${flagged.join(', ')}` : ''}${l.amended ? ` · amended ${l.amended}x` : ''}` : 'Ordered. Values are shown after laboratory verification.',
      source: o.verifiedBy ? `Verified by ${o.verifiedBy}` : 'CareWeave Laboratory', reference: o.id, status: l.status, imported: false, meta: { parameters: l.result?.parameters }
    });
  }
  for (const r of d.prescriptions)
    ev.push({ id: r.id, type: 'Prescription', date: r.date, title: `${r.medicine} · ${r.dosage}`, detail: [r.route, r.frequency, r.duration].filter(Boolean).join(' · ') + (r.status && r.status !== 'Active' ? ` [${r.status}]` : ''), source: r.source || 'CareWeave Clinic', reference: r.id, imported: !!r.imported });
  for (const r of d.imported)
    ev.push({ id: r.id, type: 'Imported record', date: r.eventDate, title: `${r.kind} from ${r.facility}`, detail: summarize(r), source: r.facility, reference: r.sourceRecordId || r.id, imported: true, status: r.status });
  for (const rf of d.referrals)
    ev.push({ id: rf.id, type: 'Referral', date: rf.date, title: `Referral: ${rf.specialty}`, detail: `${rf.providerName} · ${rf.reason}`, source: 'CareWeave Clinic', reference: rf.id, status: rf.status });
  for (const v of d.vitals)
    ev.push({ id: v.id, type: 'Vitals', date: v.date, title: `Vitals: BP ${v.bpSystolic ?? '-'}/${v.bpDiastolic ?? '-'}`, detail: [v.heartRate != null && `HR ${v.heartRate} bpm`, v.spo2 != null && `SpO2 ${v.spo2}%`, v.tempF != null && `Temp ${v.tempF} F`, v.bmi != null && `BMI ${v.bmi}`].filter(Boolean).join(' · '), source: v.recordedBy || 'CareWeave Clinic', reference: v.id });
  return ev.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Open review cases for a doctor: ones they imported, or that concern a patient linked to them. */
export async function casesFor(repos: Repos, userId: string, linked?: Set<string>) {
  const ids = linked ?? await linkedPatientIds(repos, userId);
  return repos.cases.newestFirst({ status: 'open', $or: [{ importedBy: userId }, { patientId: { $in: [...ids] } }] });
}

export async function doctorDashboard(repos: Repos, user: any) {
  const linked = await linkedPatientIds(repos, user.id);
  const [mine, orders, cases, recent] = await Promise.all([
    repos.appointments.forDoctor(user.id),
    repos.orders.newestFirst({ status: { $ne: 'cancelled' }, $or: [{ createdBy: user.id }, { orderingDoctor: user.name }, { registeredPatientRef: { $in: [...linked] } }] }),
    casesFor(repos, user.id, linked),
    repos.audit.recent(10, user.id),
  ]);
  const today = mine.filter((a: any) => isToday(a.date));
  const labs = orders.map(doctorLab);
  return {
    stats: {
      patients: linked.size,
      appointments: today.length,
      waiting: mine.filter((a: any) => ['Waiting', 'Checked In'].includes(a.status)).length,
      checkedIn: mine.filter((a: any) => a.status === 'Checked In').length,
      completed: today.filter((a: any) => a.status === 'Completed').length,
      released: labs.filter((l: any) => l.status === 'Released to Doctor').length,
      awaitingVerification: labs.filter((l: any) => l.status === 'Awaiting Verification').length,
      openCases: cases.length
    },
    // Verified in the last 3 days with a critical value: stays on the screen until it ages out, even if the live alert was missed.
    criticalLabs: labs.filter((l: any) => l.result?.parameters?.some((x: any) => x.flag === 'critical') && Date.now() - Date.parse(l.result.verifiedAt || l.requestedAt) < 3 * 86400000)
      .map((l: any) => ({ orderId: l.orderId, patientName: l.patientName, testName: l.testName, verifiedAt: l.result.verifiedAt, values: l.result.parameters.filter((x: any) => x.flag === 'critical').map((x: any) => ({ parameter: x.parameter, value: x.value, unit: x.unit })) })),
    appointments: today.sort((a: any, b: any) => String(a.time).localeCompare(String(b.time))),
    labOrders: labs.slice(0, 60),
    cases,
    recent
  };
}
