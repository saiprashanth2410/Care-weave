/** Bookable consultation slots. Every doctor works within a shift (start and end, 24-hour "HH:MM"); the slots are the half-hours inside it, minus the lunch break. */
export const SLOT_LABELS = [
  '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
  '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
];
export const DEFAULT_SHIFT = { start: '08:30', end: '16:30' };
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const hhmmToMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

/** "02:30 PM" -> 870. Anything that is not one of the labels (older records) gives null. */
export function labelToMinutes(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(String(label).trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === 'PM') h += 12;
  return h * 60 + Number(m[2]);
}

/** A doctor's shift, falling back to the default for anyone who has none set. */
export const shiftOf = (u: Record<string, any> | null | undefined) => ({
  start: HHMM.test(u?.shiftStart || '') ? (u?.shiftStart as string) : DEFAULT_SHIFT.start,
  end: HHMM.test(u?.shiftEnd || '') ? (u?.shiftEnd as string) : DEFAULT_SHIFT.end,
});

/** The slot labels that fall inside a shift. */
export function slotsForShift(shift: { start: string; end: string }) {
  const a = hhmmToMinutes(shift.start), b = hhmmToMinutes(shift.end);
  return SLOT_LABELS.filter((l) => { const m = labelToMinutes(l)!; return m >= a && m <= b; });
}

/** 24-hour "16:30" -> "04:30 PM". */
export function hhmmLabel(v: string) {
  const h = Number(v.slice(0, 2));
  return `${String(h % 12 || 12).padStart(2, '0')}:${v.slice(3, 5)} ${h >= 12 ? 'PM' : 'AM'}`;
}

export const INACTIVE_STATUSES = ['Cancelled', 'Completed', 'No Show'];
export const WAITING_STATUSES = ['Checked In', 'Checked in', 'Waiting'];
