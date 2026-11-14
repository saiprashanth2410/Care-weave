// ─── UTILITIES & HELPERS ───────────────────────────────────────────────────
export const fmtDate = (v?: string) =>
  v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const fmtTime = (v?: string) =>
  v ? new Date(v).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';

export const initials = (n: string) =>
  (n || 'Patient').split(' ').map(v => v[0]).slice(0, 2).join('').toUpperCase();

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const tomorrowISO = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/** The desk's own clock as "HH:MM" (24-hour), so the server can tell which of today's slots have passed. */
export const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** "Dr. A. Name (Consultant Physician)" -> "Dr. A. Name": a title in brackets is not part of the name. */
export const cleanName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;

/** "16:30" -> "04:30 PM". */
export const hhmmLabel = (v?: string) => {
  if (!v) return '';
  const h = Number(v.slice(0, 2));
  return `${String(h % 12 || 12).padStart(2, '0')}:${v.slice(3, 5)} ${h >= 12 ? 'PM' : 'AM'}`;
};

export function calculateAge(dob?: string): string {
  if (!dob) return '';
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return `${age} yrs`;
}

export function waitDuration(checkedInAt?: string): string {
  if (!checkedInAt) return '—';
  const ms = Math.max(0, Date.now() - new Date(checkedInAt).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function waitUrgency(checkedInAt?: string): 'low' | 'med' | 'urgent' {
  if (!checkedInAt) return 'low';
  const mins = Math.floor((Date.now() - new Date(checkedInAt).getTime()) / 60000);
  if (mins >= 30) return 'urgent';
  if (mins >= 15) return 'med';
  return 'low';
}
