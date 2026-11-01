// ─── UTILITIES & HELPERS ───────────────────────────────────────────────────
export function getDoctorRoom(doctorName?: string): string {
  const d = (doctorName || '').toLowerCase();
  if (d.includes('laha') || d.includes('anirban')) return 'Room 4';
  if (d.includes('iyer') || d.includes('rajesh')) return 'Room 2';
  if (d.includes('priya') || d.includes('sharma')) return 'Room 1';
  if (d.includes('patil') || d.includes('sneha')) return 'Room 3';
  if (d.includes('vikram') || d.includes('seth')) return 'ICU Block B';
  if (d.includes('meenakshi') || d.includes('sundaram')) return 'Room 5';
  return 'Room 4';
}
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
