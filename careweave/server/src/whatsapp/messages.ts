// Everything a patient can ask on WhatsApp, answered from the live records. Shared by the n8n query endpoints,
// the standalone inbound webhook and the in-browser simulator, so all three say the same thing.

const ACTIVE_QUEUE = ['Checked In', 'Waiting', 'In Consultation'];
const MINUTES_PER_PATIENT = 10; // a flat planning figure, so the wait is an estimate and is worded as one

const digits = (v: any) => String(v ?? '').replace(/\D/g, '');
const today = () => new Date().toISOString().slice(0, 10);
const isToday = (d: string) => !!d && (d === 'Today' || d.slice(0, 10) === today());

export function roomFor(doctorName?: string): string {
  const d = (doctorName || '').toLowerCase();
  if (d.includes('laha') || d.includes('anirban')) return 'Room 4';
  if (d.includes('iyer') || d.includes('rajesh')) return 'Room 2';
  if (d.includes('priya') || d.includes('sharma')) return 'Room 1';
  if (d.includes('patil') || d.includes('sneha')) return 'Room 3';
  if (d.includes('vikram') || d.includes('seth')) return 'ICU Block B';
  if (d.includes('meenakshi') || d.includes('sundaram')) return 'Room 5';
  return 'Room 4';
}

export function findPatients(db: any, q: { phone?: string; uhid?: string }) {
  const uhid = String(q.uhid || '').trim().toLowerCase();
  if (uhid) return db.patients.filter((p: any) => String(p.patientId).toLowerCase() === uhid || p.id === q.uhid);
  const want = digits(q.phone);
  if (want.length < 7) return [];
  const tail = want.slice(-10);
  return db.patients.filter((p: any) => digits(p.phone).slice(-10) === tail);
}

/** The next OP token for a day: A-001, A-002 ... counted over appointments that already hold one. */
export function nextToken(db: any, date: string) {
  const n = db.appointments.filter((a: any) => a.token && (a.date === date || (isToday(a.date) && isToday(date)))).length + 1;
  return `A-${String(n).padStart(3, '0')}`;
}

/** Patients ahead of this appointment: same doctor, same day, already waiting or in the room. */
export function queueAhead(db: any, appt: any) {
  const mine = String(appt.checkedInAt || '');
  return db.appointments.filter((a: any) =>
    a.id !== appt.id && a.doctorId === appt.doctorId && isToday(a.date) && ACTIVE_QUEUE.includes(a.status) &&
    (a.status === 'In Consultation' || String(a.checkedInAt || '') <= mine)
  ).length;
}

export function queueStatus(db: any, q: { phone?: string; uhid?: string }) {
  const patients = findPatients(db, q);
  if (!patients.length) return { found: false as const };
  for (const p of patients) {
    const appt = db.appointments
      .filter((a: any) => a.patientId === p.id && isToday(a.date) && ACTIVE_QUEUE.includes(a.status))
      .sort((a: any, b: any) => String(b.checkedInAt || '').localeCompare(String(a.checkedInAt || '')))[0];
    if (!appt) continue;
    const ahead = appt.status === 'In Consultation' ? 0 : queueAhead(db, appt);
    return {
      found: true as const, active: true, patient: { name: p.name, uhid: p.patientId }, token: appt.token || null, status: appt.status,
      doctor: appt.doctorName, room: roomFor(appt.doctorName), aheadCount: ahead, estimatedWaitMinutes: ahead * MINUTES_PER_PATIENT
    };
  }
  return { found: true as const, active: false, patient: { name: patients[0].name, uhid: patients[0].patientId } };
}

export function latestReport(db: any, q: { phone?: string; uhid?: string }) {
  const patients = findPatients(db, q);
  if (!patients.length) return { found: false as const };
  const ids = new Set(patients.flatMap((p: any) => [p.id, p.patientId]));
  const order = db.labOrders
    .filter((o: any) => ['verified', 'released'].includes(o.status) && (ids.has(o.registeredPatientRef) || ids.has(o.patientId)))
    .sort((a: any, b: any) => String(b.verifiedAt || '').localeCompare(String(a.verifiedAt || '')))[0];
  // Family members can share one phone number: name the person the report belongs to, not just the first match.
  const patient = (order && patients.find((p: any) => p.id === order.registeredPatientRef || p.patientId === order.patientId)) || patients[0];
  if (!order) return { found: true as const, available: false, patient: { name: patient.name, uhid: patient.patientId } };
  const results = (order.results || []).filter((r: any) => r.value).map((r: any) => ({
    parameter: r.parameter, value: r.value, unit: r.unit || '', referenceRange: r.referenceRange || '', flag: r.flag || 'normal'
  }));
  return {
    found: true as const, available: true, patient: { name: patient.name, uhid: patient.patientId },
    report: {
      orderId: order.id, testName: order.testName, verifiedAt: order.verifiedAt, verifiedBy: order.verifiedBy,
      criticalCount: results.filter((r: any) => r.flag === 'critical').length,
      abnormalCount: results.filter((r: any) => r.flag === 'abnormal').length,
      results
    }
  };
}

type Slot = 'morning' | 'afternoon' | 'night';

/** Reads "1-0-1", "BD", "twice daily", "at bedtime" and the like. Anything it cannot read is not guessed at. */
export function scheduleOf(frequency: string): Slot[] | null {
  const f = String(frequency || '').toLowerCase();
  // "once weekly", "alternate days", "as needed" are not daily: leave them as directed rather than guess.
  if (/week|month|alternate|every other|\bsos\b|\bprn\b|as needed|when required/.test(f)) return null;
  const dash = f.match(/\b([01])\s*-\s*([01])\s*-\s*([01])\b/);
  if (dash) return (['morning', 'afternoon', 'night'] as Slot[]).filter((_, i) => dash[i + 1] === '1');
  if (/\b(tds|tid)\b|three times|thrice|\b3 times|four times|\bqid\b|\bqds\b|every [4-6] hours/.test(f)) return ['morning', 'afternoon', 'night'];
  if (/\b(bd|bid)\b|twice|two times|\b2 times|every (8|12) hours/.test(f)) return ['morning', 'night'];
  if (/\b(hs|qhs)\b|night|bedtime|evening/.test(f)) return ['night'];
  if (/\b(od|qd)\b|once|daily|every day|morning/.test(f)) return ['morning'];
  return null;
}

const foodNote = (text: string) => {
  const t = text.toLowerCase();
  if (/before (food|meal)/.test(t)) return 'Before food';
  if (/after (food|meal)/.test(t)) return 'After food';
  if (/with (food|meal)/.test(t)) return 'With food';
  return '';
};

function stillRunning(rx: any) {
  const m = String(rx.duration || '').toLowerCase().match(/(\d+)\s*(day|week|month)/);
  if (!m) return true;
  const days = Number(m[1]) * (m[2] === 'week' ? 7 : m[2] === 'month' ? 30 : 1);
  return Date.now() - new Date(rx.date).getTime() <= days * 86400000;
}

export function activePrescriptions(db: any, q: { phone?: string; uhid?: string }) {
  const patients = findPatients(db, q);
  if (!patients.length) return { found: false as const };
  const ids = new Set(patients.map((p: any) => p.id));
  const shared = patients.length > 1; // one phone, several people: say whose medicine each line is
  const meds = db.prescriptions.filter((r: any) => ids.has(r.patientId) && r.status === 'Active' && stillRunning(r)).map((r: any) => {
    const slots = scheduleOf(r.frequency);
    const owner = shared ? patients.find((p: any) => p.id === r.patientId)?.name : '';
    return {
      medicine: owner ? `${r.medicine} (${owner})` : r.medicine, dosage: r.dosage, frequency: r.frequency, duration: r.duration || '',
      food: foodNote(`${r.frequency} ${r.instructions || ''}`), instructions: r.instructions || '',
      schedule: slots ? { morning: slots.includes('morning') ? r.dosage : null, afternoon: slots.includes('afternoon') ? r.dosage : null, night: slots.includes('night') ? r.dosage : null } : null
    };
  });
  return { found: true as const, patient: { name: patients[0].name, uhid: patients[0].patientId }, medications: meds };
}

// ── wording ────────────────────────────────────────────────────────────────
export const HELP_TEXT = 'CareWeave on WhatsApp. Reply with:\n*QUEUE* - your token and wait time\n*REPORT* - your latest verified lab report\n*MEDS* - your medicine timings\n*HELP* - this list';
const NOT_FOUND = 'We could not find a CareWeave record for this number. Please check with the front desk.';

export function queueText(r: ReturnType<typeof queueStatus>) {
  if (!r.found) return NOT_FOUND;
  if (!r.active) return `Hello ${r.patient.name}, you are not in today's queue. Please check in at the front desk.`;
  if (r.status === 'In Consultation') return `Hello ${r.patient.name}, ${r.doctor} is seeing you now (${r.room}).`;
  return `Hello ${r.patient.name}, your token is *${r.token}* with ${r.doctor} (${r.room}).\n${r.aheadCount} patient${r.aheadCount === 1 ? '' : 's'} ahead of you. Estimated wait: about ${r.estimatedWaitMinutes} min (an estimate, it can change).`;
}

export function reportText(r: ReturnType<typeof latestReport>) {
  if (!r.found) return NOT_FOUND;
  if (!r.available) return `Hello ${r.patient.name}, you have no verified lab report yet.`;
  const { report } = r;
  const lines = report.results.slice(0, 12).map((x: any) => `${x.flag === 'critical' ? '🔴' : x.flag === 'abnormal' ? '🟠' : '▫️'} ${x.parameter}: ${x.value} ${x.unit}${x.flag !== 'normal' ? ` (${x.flag.toUpperCase()})` : ''}`);
  return `🧪 ${report.testName} - verified by ${report.verifiedBy || 'the laboratory'}.\n${lines.join('\n')}\nCritical flags: ${report.criticalCount}. Abnormal: ${report.abnormalCount}.\nPlease discuss these results with your doctor.`;
}

export function medsText(r: ReturnType<typeof activePrescriptions>) {
  if (!r.found) return NOT_FOUND;
  if (!r.medications.length) return `Hello ${r.patient.name}, you have no active prescriptions.`;
  const part = (label: string, slot: 'morning' | 'afternoon' | 'night') => {
    const rows = r.medications.filter((m: any) => m.schedule?.[slot]).map((m: any) => `  • ${m.medicine} - ${m.schedule[slot]}${m.food ? ` (${m.food})` : ''}`);
    return rows.length ? `*${label}*\n${rows.join('\n')}` : '';
  };
  const unclear = r.medications.filter((m: any) => !m.schedule).map((m: any) => `  • ${m.medicine} - ${m.dosage}, ${m.frequency}`);
  return [`💊 Medicines for ${r.patient.name}`, part('Morning', 'morning'), part('Afternoon', 'afternoon'), part('Night', 'night'), unclear.length ? `*As directed*\n${unclear.join('\n')}` : ''].filter(Boolean).join('\n');
}

/** One keyword in, one reply out. Unknown text gets the help list. */
export function replyTo(db: any, phone: string, body: string) {
  const word = String(body || '').trim().split(/\s+/)[0]?.toUpperCase() || '';
  if (word === 'QUEUE' || word === 'TOKEN') return { command: 'QUEUE', reply: queueText(queueStatus(db, { phone })) };
  if (word === 'REPORT') return { command: 'REPORT', reply: reportText(latestReport(db, { phone })) };
  if (word === 'MEDS' || word === 'RX') return { command: 'MEDS', reply: medsText(activePrescriptions(db, { phone })) };
  return { command: 'HELP', reply: HELP_TEXT };
}

/** What a patient is sent when each event fires. */
export function eventText(e: any): string {
  if (e.event === 'PATIENT_CHECKED_IN') return `Welcome ${e.name}! Your token is *${e.token}* with ${e.doctor} (${e.room}). Queue position: ${e.queuePosition}. Reply QUEUE any time for your live wait.`;
  if (e.event === 'LAB_REPORT_RELEASED') return `🧪 CareWeave Lab Alert: Hello ${e.name}, your ${e.testName} results have been verified by ${e.pathologist || 'the laboratory'}. Critical flags: ${e.criticalCount}. Reply REPORT to view them.`;
  if (e.event === 'PRESCRIPTION_PRESCRIBED') return `💊 Hello ${e.name}, ${e.doctor || 'your doctor'} prescribed: ${(e.medicines || []).map((m: any) => m.name).join(', ')}. Reply MEDS for your timings.`;
  return '';
}
