

export const fmtDate = (v?: string) => v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const initials = (n: string) => n.split(' ').map(v => v[0]).slice(0, 2).join('').toUpperCase();

export const todayISO = () => new Date().toISOString().slice(0, 10);


export function waitDuration(checkedInAt?: string): string {
  if (!checkedInAt) return '—';
  const ms = Date.now() - new Date(checkedInAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
