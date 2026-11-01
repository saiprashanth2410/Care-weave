import crypto from 'node:crypto';

export const now = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
export const text = (v: any, max = 200) => String(v ?? '').trim().slice(0, max);

export const isoToday = () => new Date().toISOString().slice(0, 10);
export function isToday(dateStr: string) {
  if (!dateStr) return false;
  if (dateStr === 'Today') return true;
  return dateStr.slice(0, 10) === isoToday();
}

export function ageFromDob(dob: string) {
  const d = new Date(dob);
  if (isNaN(+d)) return 0;
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return Math.max(0, a);
}

/** What the front desk and the lab see of a patient: no chart data. `version` is what the client sends back on an edit. */
export function adminPatientView(p: any) {
  return {
    id: p.id,
    patientId: p.patientId,
    name: p.name,
    dob: p.dob,
    phone: p.phone,
    email: p.email,
    emergencyContact: p.emergencyContact,
    createdAt: p.createdAt,
    risk: p.risk,
    version: p.version
  };
}

/** The fields of `after` that differ from `before`; a field removed from `after` comes back as undefined so the write unsets it. */
export function diff(before: Record<string, any>, after: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === 'id' || k === 'version') continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = after[k];
  }
  return out;
}
