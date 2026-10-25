import { parseMedicine } from '../medicines.js';
import { dosesPerDay, durationDays, extractMolecules } from '../safety/molecules.js';

// Turns CareWeave's application records into the rows loaded into Exasol. Nothing is invented here:
// a figure that cannot be worked out from the stored timestamps and fields is left as null.

export type VisitRow = {
  visitId: string; patientId: string; visitDate: string; visitTime: string; department: string; doctorName: string;
  status: string; reason: string; waitMinutes: number | null;
};
export type LabRow = {
  orderId: string; patientId: string; testName: string; department: string; priority: 'routine' | 'urgent'; status: string;
  orderedAt: string | null; collectedAt: string | null; verifiedAt: string | null; releasedAt: string | null;
  tatMinutes: number | null; slaTargetMinutes: number; withinSla: boolean | null; criticalFlagCount: number; abnormalFlagCount: number;
};
export type RxRow = {
  prescriptionId: string; patientId: string; doctorName: string; prescribedDate: string; medicineName: string; genericName: string;
  form: string; dosage: string; quantity: number | null; durationDays: number | null; allergyOverride: boolean; duplicateOverride: boolean;
};

// Service-level targets for turnaround time, from the ordering-to-verified interval. They are assumptions, adjustable per site.
export const SLA_MINUTES = {
  urgent: Number(process.env.LAB_SLA_URGENT_MINUTES) || 45,
  routine: Number(process.env.LAB_SLA_ROUTINE_MINUTES) || 120,
};

const DONE_LAB = new Set(['verified', 'released']);
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(+d) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
};
const ms = (v: unknown) => { const d = v ? new Date(String(v)) : null; return d && !isNaN(+d) ? +d : null; };
const minutesBetween = (a: unknown, b: unknown): number | null => {
  const x = ms(a), y = ms(b);
  return x === null || y === null || y < x ? null : Math.round(((y - x) / 60000) * 10) / 10;
};

// The record has no department field for a visit, so it is inferred from the stated reason.
export function departmentFor(reason: string): string {
  const r = (reason || '').toLowerCase();
  if (/(heart|cardi|chest pain|blood pressure|hypertens)/.test(r)) return 'Cardiology';
  if (/(sugar|diabet|thyroid|hba1c|endocrin)/.test(r)) return 'Endocrinology';
  return 'General Medicine';
}

export function deriveVisits(appointments: any[]): VisitRow[] {
  return appointments.filter((a) => a?.id && /^\d{4}-\d{2}-\d{2}$/.test(String(a.date))).map((a) => ({
    visitId: String(a.id),
    patientId: String(a.patientIdCode || a.patientId || ''),
    visitDate: String(a.date),
    visitTime: String(a.time || ''),
    department: departmentFor(a.reason),
    doctorName: String(a.doctorName || 'Unassigned'),
    status: String(a.status || 'Scheduled').toLowerCase().replace(/\s+/g, '-'),
    reason: String(a.reason || ''),
    // Wait is the time from check-in to the start of the consultation. Without both moments it is unknown.
    waitMinutes: minutesBetween(a.checkedInAt, a.startedAt),
  }));
}

export function deriveLabOrders(labOrders: any[]): LabRow[] {
  return labOrders.filter((o) => o?.id).map((o) => {
    const priority: 'routine' | 'urgent' = o.priority === 'urgent' ? 'urgent' : 'routine';
    const orderedAt = o.orderedAt || o.registrationAt || o.createdAt;
    const verifiedAt = DONE_LAB.has(o.status) ? o.verifiedAt || o.approvedAt || o.releasedAt : null;
    // An order that is not verified yet has no turnaround time. It is not counted as if it finished now.
    const tat = DONE_LAB.has(o.status) ? minutesBetween(orderedAt, verifiedAt) : null;
    const sla = SLA_MINUTES[priority];
    const results: any[] = Array.isArray(o.results) ? o.results : [];
    return {
      orderId: String(o.id),
      patientId: String(o.patientId || ''),
      testName: String(o.testName || 'Unnamed test'),
      department: String(o.department || 'Unassigned'),
      priority,
      status: String(o.status || 'requested'),
      orderedAt: iso(orderedAt),
      collectedAt: iso(o.collectedAt),
      verifiedAt: iso(verifiedAt),
      // The application records no separate release moment, so this stays empty rather than copying the verification time.
      releasedAt: DONE_LAB.has(o.status) ? iso(o.releasedAt) : null,
      tatMinutes: tat,
      slaTargetMinutes: sla,
      withinSla: tat === null ? null : tat <= sla,
      criticalFlagCount: results.filter((r) => r?.flag === 'critical').length,
      abnormalFlagCount: results.filter((r) => r?.flag === 'abnormal').length,
    };
  });
}

export function deriveRx(prescriptions: any[]): RxRow[] {
  return prescriptions.filter((r) => r?.id && r.medicine).map((r) => {
    const name = String(r.medicine);
    const parsed = parseMedicine(`x\t${name}\t`);
    const molecules = extractMolecules(name);
    const perDay = dosesPerDay(String(r.frequency || ''));
    const days = durationDays(r.duration) || null;
    return {
      prescriptionId: String(r.id),
      patientId: String(r.patientId || ''),
      doctorName: String(r.prescribingClinician || 'Unassigned'),
      prescribedDate: (iso(r.date) || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      medicineName: parsed && parsed.generic ? parsed.brand : name,
      genericName: molecules.join(' + ') || name,
      form: parsed?.form || '',
      dosage: String(r.dosage || ''),
      // Units dispensed are not stored, so they are estimated from the prescription: doses per day times the days it runs.
      quantity: perDay && days ? Math.round(perDay * days) : null,
      durationDays: days,
      allergyOverride: Boolean(r.allergyOverrideReason),
      duplicateOverride: Boolean(r.duplicateOverride),
    };
  });
}
