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

/**
 * Reports and medicines are private health data, and a phone number alone is not proof of who is asking (numbers are
 * shared, spoofed and recycled). They are shown only when the sender's phone AND the patient's UHID both match.
 */
export function verifiedPatients(db: any, q: { phone?: string; uhid?: string }) {
  if (!String(q.uhid || '').trim() || digits(q.phone).length < 7) return { status: 'needs_uhid' as const, patients: [] as any[] };
  const byUhid = findPatients(db, { uhid: q.uhid });
  const tail = digits(q.phone).slice(-10);
  const patients = byUhid.filter((p: any) => digits(p.phone).slice(-10) === tail);
  return patients.length ? { status: 'ok' as const, patients } : { status: 'mismatch' as const, patients: [] as any[] };
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
  const v = verifiedPatients(db, q);
  if (v.status === 'needs_uhid') return { found: true as const, verificationRequired: true as const };
  const patients = v.patients;
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
  const v = verifiedPatients(db, q);
  if (v.status === 'needs_uhid') return { found: true as const, verificationRequired: true as const };
  const patients = v.patients;
  if (!patients.length) return { found: false as const };
  const ids = new Set(patients.map((p: any) => p.id));
  const meds = db.prescriptions.filter((r: any) => ids.has(r.patientId) && r.status === 'Active' && stillRunning(r)).map((r: any) => {
    const slots = scheduleOf(r.frequency);
    return {
      medicine: r.medicine, dosage: r.dosage, frequency: r.frequency, duration: r.duration || '',
      food: foodNote(`${r.frequency} ${r.instructions || ''}`), instructions: r.instructions || '',
      schedule: slots ? { morning: slots.includes('morning') ? r.dosage : null, afternoon: slots.includes('afternoon') ? r.dosage : null, night: slots.includes('night') ? r.dosage : null } : null
    };
  });
  return { found: true as const, patient: { name: patients[0].name, uhid: patients[0].patientId }, medications: meds };
}

/** The language a sender chose is stored in the database (see repo/whatsappPrefs.ts); `replyTo` reads it from `db.language` and reports a change in `language`. */
const languageOf = (db: any): 'en' | 'ta' => (db?.language === 'ta' ? 'ta' : 'en');

// ── wording ────────────────────────────────────────────────────────────────
export const HELP_TEXT = `🏥 CareWeave on WhatsApp. Reply with:
*QUEUE* - your token and live wait time
*REPORT <your UHID>* - your verified lab report
*MEDS <your UHID>* - your daily medicine timings
*LANG TA* - தமிழுக்கு மாற்ற (Switch to Tamil)
*LANG EN* - Switch to English
*HELP* - this menu

Your UHID is on your token slip and patient card.`;

export const HELP_TEXT_TA = `🏥 CareWeave வாட்ஸ்அப் உதவி மையம்:
*QUEUE* - உங்கள் டோக்கன் & காத்திருக்கும் நேரம்
*REPORT <UHID>* - உங்கள் ஆய்வக பரிசோதனை முடிவு
*MEDS <UHID>* - உங்கள் தினசரி மாத்திரை நேரங்கள்
*LANG EN* - Switch to English
*LANG TA* - தமிழில் தொடர

(உங்கள் UHID எண் டோக்கன் ரசீதில் இருக்கும்)`;

const NEEDS_UHID = 'To protect your health records, add your UHID after the word, for example: *REPORT CW-12345*. It is on your token slip and patient card.';
const NEEDS_UHID_TA = 'உங்கள் மருத்துவ ரகசியத்தைப் பாதுகாக்க, வார்த்தைக்குப் பின் உங்கள் UHID எண்ணை அனுப்பவும். எ.கா: *REPORT CW-12345*. இது உங்கள் டோக்கன் சீட்டில் இருக்கும்.';

const NOT_FOUND = 'We could not find a CareWeave record for this number. Please check with the front desk.';
const NOT_FOUND_TA = 'இந்த எண்ணிற்கான CareWeave பதிவு கிடைக்கவில்லை. தயவுசெய்து வரவேற்பறையை அணுகவும்.';

export function queueText(r: ReturnType<typeof queueStatus>, lang: 'en' | 'ta' = 'en') {
  if (!r.found) return lang === 'ta' ? NOT_FOUND_TA : NOT_FOUND;
  if (!r.active) {
    return lang === 'ta'
      ? `வணக்கம் ${r.patient.name}, நீங்கள் இன்றைய வரிசையில் இல்லை. வரவேற்பறையில் பதிவு செய்யவும்.`
      : `Hello ${r.patient.name}, you are not in today's queue. Please check in at the front desk.`;
  }
  if (r.status === 'In Consultation') {
    return lang === 'ta'
      ? `வணக்கம் ${r.patient.name}, மருத்துவர் ${r.doctor} இப்போது உங்களைப் பார்க்கிறார் (${r.room}).`
      : `Hello ${r.patient.name}, ${r.doctor} is seeing you now (${r.room}).`;
  }
  return lang === 'ta'
    ? `வணக்கம் ${r.patient.name}! உங்கள் டோக்கன் எண் *${r.token}* (${r.doctor} - ${r.room}).\nஉங்களுக்கு முன் *${r.aheadCount}* நோயாளிகள் உள்ளனர். உத்தேச காத்திருப்பு: சுமார் *${r.estimatedWaitMinutes}* நிமிடங்கள்.`
    : `Hello ${r.patient.name}, your token is *${r.token}* with ${r.doctor} (${r.room}).\n${r.aheadCount} patient${r.aheadCount === 1 ? '' : 's'} ahead of you. Estimated wait: about ${r.estimatedWaitMinutes} min (an estimate, it can change).`;
}

export function reportText(r: ReturnType<typeof latestReport>, lang: 'en' | 'ta' = 'en') {
  if (!r.found) return lang === 'ta' ? NOT_FOUND_TA : NOT_FOUND;
  if ('verificationRequired' in r) return lang === 'ta' ? NEEDS_UHID_TA : NEEDS_UHID;
  if (!r.available) {
    return lang === 'ta'
      ? `வணக்கம் ${r.patient.name}, உங்களுக்கான ஆய்வக முடிவுகள் இன்னும் சரிபார்க்கப்படவில்லை.`
      : `Hello ${r.patient.name}, you have no verified lab report yet.`;
  }
  const { report } = r;
  const lines = report.results.slice(0, 12).map((x: any) => `${x.flag === 'critical' ? '🔴' : x.flag === 'abnormal' ? '🟠' : '▫️'} ${x.parameter}: ${x.value} ${x.unit}${x.flag !== 'normal' ? ` (${x.flag.toUpperCase()})` : ''}`);
  return lang === 'ta'
    ? `🧪 ${report.testName} - மருத்துவர்/ஆய்வகம்: ${report.verifiedBy || 'CareWeave Central Lab'}.\n${lines.join('\n')}\nமுக்கிய எச்சரிக்கைகள்: ${report.criticalCount}. மாறுபட்டவை: ${report.abnormalCount}.\nதயவுசெய்து இந்த முடிவுகளை உங்கள் மருத்துவரிடம் கலந்தாலோசிக்கவும்.`
    : `🧪 ${report.testName} - verified by ${report.verifiedBy || 'the laboratory'}.\n${lines.join('\n')}\nCritical flags: ${report.criticalCount}. Abnormal: ${report.abnormalCount}.\nPlease discuss these results with your doctor.`;
}

export function medsText(r: ReturnType<typeof activePrescriptions>, lang: 'en' | 'ta' = 'en') {
  if (!r.found) return lang === 'ta' ? NOT_FOUND_TA : NOT_FOUND;
  if ('verificationRequired' in r) return lang === 'ta' ? NEEDS_UHID_TA : NEEDS_UHID;
  if (!r.medications.length) {
    return lang === 'ta'
      ? `வணக்கம் ${r.patient.name}, உங்களுக்கு தற்போது நடைமுறையில் மருந்துகள் ஏதுமில்லை.`
      : `Hello ${r.patient.name}, you have no active prescriptions.`;
  }
  const part = (label: string, slot: 'morning' | 'afternoon' | 'night') => {
    const rows = r.medications.filter((m: any) => m.schedule?.[slot]).map((m: any) => `  • ${m.medicine} - ${m.schedule[slot]}${m.food ? ` (${m.food})` : ''}`);
    return rows.length ? `*${label}*\n${rows.join('\n')}` : '';
  };
  const unclear = r.medications.filter((m: any) => !m.schedule).map((m: any) => `  • ${m.medicine} - ${m.dosage}, ${m.frequency}`);
  const morningLbl = lang === 'ta' ? '🌅 காலை (Morning)' : 'Morning';
  const afternoonLbl = lang === 'ta' ? '☀️ மதியம் (Afternoon)' : 'Afternoon';
  const nightLbl = lang === 'ta' ? '🌙 இரவு (Night)' : 'Night';
  const directedLbl = lang === 'ta' ? 'மருத்துவர் கூறியபடி (As directed)' : 'As directed';
  const title = lang === 'ta' ? `💊 ${r.patient.name} அவர்களுக்கான மருந்துகள்:` : `💊 Medicines for ${r.patient.name}`;

  return [title, part(morningLbl, 'morning'), part(afternoonLbl, 'afternoon'), part(nightLbl, 'night'), unclear.length ? `*${directedLbl}*\n${unclear.join('\n')}` : ''].filter(Boolean).join('\n');
}

/** One keyword in, one reply out. Unknown text gets the help list. */
export function replyTo(db: any, phone: string, body: string): { command: string; reply: string; language?: 'en' | 'ta' } {
  const [first, second] = String(body || '').trim().split(/\s+/);
  const word = first?.toUpperCase() || '';
  const uhid = second || '';

  // Language switch handlers
  if (word === 'LANG' || word === 'LANGUAGE') {
    const sub = second?.toUpperCase() || '';
    if (sub === 'TA' || sub === 'TAMIL') {
      return { command: 'LANG', language: 'ta' as const, reply: '✅ மொழி தமிழுக்கு மாற்றப்பட்டது!\nஇனி உங்கள் டோக்கன் மற்றும் மருத்துவ தகவல்கள் தமிழில் வரும்.\nதகவல்களை அறிய *QUEUE*, *MEDS*, அல்லது *REPORT* என அனுப்பவும்.' };
    }
    if (sub === 'EN' || sub === 'ENGLISH') {
      return { command: 'LANG', language: 'en' as const, reply: '✅ Language switched to English!\nReply with QUEUE, MEDS, or REPORT at any time.' };
    }
  }

  const lang = languageOf(db);

  if (word === 'QUEUE' || word === 'TOKEN') return { command: 'QUEUE', reply: queueText(queueStatus(db, { phone }), lang) };
  if (word === 'REPORT') return { command: 'REPORT', reply: reportText(latestReport(db, { phone, uhid }), lang) };
  if (word === 'MEDS' || word === 'RX') return { command: 'MEDS', reply: medsText(activePrescriptions(db, { phone, uhid }), lang) };
  return { command: 'HELP', reply: lang === 'ta' ? HELP_TEXT_TA : HELP_TEXT };
}

/** What a patient is sent when each event fires. */
export function eventText(e: any): string {
  if (e.event === 'PATIENT_CHECKED_IN') return `Welcome ${e.name}! Your token is *${e.token}* with ${e.doctor} (${e.room}). Queue position: ${e.queuePosition}. Reply QUEUE any time for your live wait.`;
  if (e.event === 'LAB_REPORT_RELEASED') return `🧪 CareWeave Lab Alert: Hello ${e.name}, your ${e.testName} results have been verified by ${e.pathologist || 'the laboratory'}. Critical flags: ${e.criticalCount}. Reply REPORT ${e.patientId || '<your UHID>'} to view them.`;
  if (e.event === 'PRESCRIPTION_PRESCRIBED') return `💊 Hello ${e.name}, ${e.doctor || 'your doctor'} prescribed: ${(e.medicines || []).map((m: any) => m.name).join(', ')}. Reply MEDS ${e.patientId || '<your UHID>'} for your timings.`;
  return '';
}
