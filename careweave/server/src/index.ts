import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { extractWithClaude, ScanError } from './claudeScan.js';
import { buildSeed, ensureSeed } from './seed.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const DATA = path.resolve('data/careweave.json');

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '14mb' })); // 10 MB scan images arrive base64-encoded

let db: any;
let mongoConnected = false;
// Sessions are keyed by a hash of the token, so the database never holds a usable token.
const sessions = new Map<string, { userId: string; expires: number }>();
const tokenKey = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomBytes(4).toString('hex')}`;

// Every collection lives in MongoDB when connected. The JSON file is only an offline fallback.
const COLLECTIONS = ['users', 'patients', 'appointments', 'labOrders', 'auditLogs', 'sessions'] as const;

async function loadFromMongo() {
  const out: any = {};
  for (const c of COLLECTIONS) {
    out[c] = await mongoose.connection.db!.collection(c).find({}, { projection: { _id: 0 } }).toArray();
  }
  return out;
}

async function saveToMongo() {
  for (const c of COLLECTIONS) {
    const coll = mongoose.connection.db!.collection(c);
    const docs: any[] = db[c] || [];
    if (docs.length) {
      await coll.bulkWrite(docs.map((d) => ({ replaceOne: { filter: { id: d.id }, replacement: d, upsert: true } })));
    }
    await coll.deleteMany({ id: { $nin: docs.map((d) => d.id) } });
  }
}

let saving: Promise<void> = Promise.resolve();
function save() {
  const nowMs = Date.now();
  for (const [k, v] of sessions) if (v.expires < nowMs) sessions.delete(k);
  db.sessions = [...sessions].map(([id, v]) => ({ id, ...v }));
  // Serialise writes so two requests never interleave their bulk operations.
  saving = saving.then(async () => {
    if (mongoConnected) return saveToMongo();
    await fs.mkdir(path.dirname(DATA), { recursive: true });
    await fs.writeFile(DATA, JSON.stringify(db, null, 2));
  });
  return saving;
}

function user(req: any) {
  const raw = String(req.headers.authorization || '').replace('Bearer ', '');
  const s = sessions.get(tokenKey(raw));
  if (!s || s.expires < Date.now()) return null;
  return db.users.find((u: any) => u.id === s.userId) || null;
}

function auth(req: any, res: any, next: any) {
  const u = user(req);
  if (!u) return res.status(401).json({ error: 'Authentication required' });
  req.user = u;
  next();
}

function roles(...allowed: string[]) {
  return (req: any, res: any, next: any) => {
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'This action is not permitted for your role' });
    }
    next();
  };
}

function audit(req: any, action: string, entity: string, entityId: string, detail = '') {
  db.auditLogs.push({
    id: id('audit'),
    actorId: req.user.id,
    actorRole: req.user.role,
    action,
    entity,
    entityId,
    detail,
    timestamp: now()
  });
}

function patientById(value: string) {
  return db.patients.find((p: any) => p.id === value || p.patientId === value);
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isToday(dateStr: string) {
  if (!dateStr) return false;
  if (dateStr === 'Today') return true;
  return dateStr.slice(0, 10) === isoToday();
}

function adminPatientView(p: any) {
  return {
    id: p.id,
    patientId: p.patientId,
    name: p.name,
    dob: p.dob,
    phone: p.phone,
    email: p.email,
    emergencyContact: p.emergencyContact,
    createdAt: p.createdAt,
    risk: p.risk
  };
}

// Health check endpoint with MongoDB Atlas connection status
app.get('/api/health', (_, res) =>
  res.json({
    ok: true,
    service: 'careweave-api',
    database: mongoConnected ? 'mongodb-atlas' : 'local-json',
    atlasConnected: mongoConnected
  })
);

// Sign in
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const u = db.users.find((x: any) => x.email === email);
  if (!u || !(await bcrypt.compare(String(password || ''), u.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(tokenKey(token), { userId: u.id, expires: Date.now() + 8 * 60 * 60 * 1000 });
  audit({ user: u }, 'login', 'session', u.id, 'Successful receptionist sign-in');
  await save();
  res.json({
    token,
    user: { id: u.id, name: u.name, email: u.email, role: u.role, facility: u.facility }
  });
});

app.use('/api', auth);

app.get('/api/me', (req: any, res) =>
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    facility: req.user.facility
  })
);

// Dashboard stats
app.get('/api/dashboard', (req: any, res) => {
  const todayAppts = db.appointments.filter((a: any) => isToday(a.date));
  const stats: any = {
    patients: db.patients.length,
    appointments: todayAppts.length,
    waiting: db.appointments.filter((a: any) => ['Waiting', 'Checked in', 'Checked In'].includes(a.status)).length,
    checkedIn: db.appointments.filter((a: any) => ['Checked in', 'Checked In'].includes(a.status)).length,
    inConsultation: db.appointments.filter((a: any) => a.status === 'In Consultation').length,
    completed: db.appointments.filter((a: any) => a.status === 'Completed').length,
    cancelled: db.appointments.filter((a: any) => a.status === 'Cancelled').length,
    todayCompleted: todayAppts.filter((a: any) => a.status === 'Completed').length,
    todayScheduled: todayAppts.filter((a: any) => a.status === 'Scheduled').length,
  };
  const appointments = todayAppts.sort((a: any, b: any) => a.time.localeCompare(b.time));
  res.json({ stats, appointments, recent: db.auditLogs.slice(-15).reverse() });
});

// Patient endpoints
app.get('/api/patients', roles('receptionist', 'doctor', 'lab'), (req: any, res) => {
  const q = String(req.query.query || '').toLowerCase();
  const rows = db.patients.filter(
    (p: any) => !q || [p.name, p.patientId, p.phone, p.email].some(v => String(v || '').toLowerCase().includes(q))
  );
  audit(req, 'search', 'patient', 'directory', q ? 'Search by permitted identifiers' : 'Open patient directory');
  res.json(rows.map(adminPatientView));
});

app.post('/api/patients', roles('receptionist', 'doctor', 'lab'), async (req: any, res) => {
  const { name, dob, phone, email, emergencyContact, _forceCreate, risk, gender } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Full name is required' });
  if (!dob) return res.status(400).json({ error: 'Date of birth is required' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone number is required' });

  const nameNorm = String(name).trim().toLowerCase();
  const duplicates = db.patients.filter((p: any) => p.name.toLowerCase() === nameNorm && p.dob === dob);
  if (duplicates.length > 0 && !_forceCreate) {
    return res.status(409).json({
      error: 'Possible duplicate registration detected.',
      duplicates: duplicates.map(adminPatientView)
    });
  }

  const p = {
    id: id('p'),
    patientId: `CW-${Math.floor(10000 + Math.random() * 89999)}`,
    name: String(name).trim(),
    dob,
    gender: ['M', 'F', 'O'].includes(gender) ? gender : 'F',
    phone: String(phone).trim(),
    email: email || undefined,
    emergencyContact: emergencyContact || undefined,
    createdAt: now(),
    risk: risk || undefined
  };
  db.patients.unshift(p);
  audit(req, 'create', 'patient', p.id, 'Administrative registration');
  await save();
  res.status(201).json(adminPatientView(p));
});

app.get('/api/patients/:id/admin', roles('receptionist', 'doctor', 'lab'), (req: any, res) => {
  const p = patientById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  audit(req, 'read', 'patient', p.id, 'Open administrative patient profile');
  const appointments = db.appointments
    .filter((a: any) => a.patientId === p.id)
    .map((a: any) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      reason: a.reason,
      status: a.status,
      doctorName: a.doctorName,
      checkedInAt: a.checkedInAt
    }));
  const labOrders = (db.labOrders || [])
    .filter((o: any) => o.registeredPatientRef === p.id || o.patientId === p.patientId || o.patientUhid === p.patientId)
    .sort((a: any, b: any) => String(b.orderedAt).localeCompare(String(a.orderedAt)));
  res.json({ ...adminPatientView(p), appointments, labOrders });
});

app.patch('/api/patients/:id', roles('receptionist'), async (req: any, res) => {
  const p = patientById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const { name, phone, email, emergencyContact } = req.body || {};
  if (name) p.name = String(name).trim();
  if (phone) p.phone = String(phone).trim();
  if (email !== undefined) p.email = email || undefined;
  if (emergencyContact !== undefined) p.emergencyContact = emergencyContact || undefined;
  audit(req, 'update', 'patient', p.id, 'Updated permitted demographic fields');
  await save();
  res.json(adminPatientView(p));
});

// Doctor list for receptionist appointment booking
app.get('/api/doctors', roles('receptionist', 'doctor', 'lab'), (req: any, res) => {
  const doctors = db.users.filter((u: any) => u.role === 'doctor').map((u: any) => ({ id: u.id, name: u.name, facility: u.facility }));
  res.json(doctors);
});

// Appointments
app.get('/api/appointments', roles('receptionist', 'doctor'), (req: any, res) => {
  const { date, status, patientId } = req.query as any;
  let rows = db.appointments;
  if (date === 'today') rows = rows.filter((a: any) => isToday(a.date));
  if (status) rows = rows.filter((a: any) => a.status === status);
  if (patientId) rows = rows.filter((a: any) => a.patientId === patientId);
  res.json(rows);
});

app.post('/api/appointments', roles('receptionist'), async (req: any, res) => {
  const p = patientById(req.body.patientId);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const { date, time, reason, doctorId } = req.body;
  if (!date || !time) return res.status(400).json({ error: 'Date and time are required' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason for appointment is required' });

  const conflict = db.appointments.find(
    (a: any) => a.patientId === p.id && a.date === date && a.time === time && !['Cancelled', 'Completed', 'No Show'].includes(a.status)
  );
  if (conflict) return res.status(409).json({ error: `Patient already has an appointment at ${time} on ${date}` });

  const doctor = doctorId ? db.users.find((u: any) => u.id === doctorId) : db.users.find((u: any) => u.role === 'doctor');
  const a = {
    id: id('appt'),
    patientId: p.id,
    patientName: p.name,
    patientIdCode: p.patientId,
    doctorId: doctor?.id || '',
    doctorName: doctor?.name || 'Unassigned',
    date,
    time,
    reason: String(reason).trim(),
    status: 'Scheduled'
  };
  db.appointments.push(a);
  audit(req, 'create', 'appointment', a.id, `${p.name} · ${date} ${time}`);
  await save();
  res.status(201).json(a);
});

app.patch('/api/appointments/:id', roles('receptionist', 'doctor'), async (req: any, res) => {
  const a = db.appointments.find((x: any) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  const { status, date, time, reason } = req.body;
  const validStatuses = ['Scheduled', 'Checked In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled', 'No Show'];
  if (status) {
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid appointment status' });
    if (status === a.status) return res.status(409).json({ error: `Patient is already marked as ${status}` });
    a.status = status;
    if ((status === 'Checked In' || status === 'Waiting') && !a.checkedInAt) a.checkedInAt = now();
  }
  if (date || time) {
    if (!['Scheduled'].includes(a.status) && !status) {
      return res.status(400).json({ error: 'Only scheduled appointments can be rescheduled' });
    }
    if (date) a.date = date;
    if (time) a.time = time;
    a.rescheduledAt = now();
  }
  if (reason) a.reason = String(reason).trim();
  audit(req, 'update', 'appointment', a.id, `Status: ${a.status}${date ? ` · Rescheduled to ${a.date} ${a.time}` : ''}`);
  await save();
  res.json(a);
});

async function initMongo() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.log('No MONGODB_URI set. Running with local store (data/careweave.json).');
    return;
  }
  try {
    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || 'careweave',
      serverSelectionTimeoutMS: 8000
    });
    mongoConnected = true;
    console.log(`Connected to MongoDB Atlas: database "${mongoose.connection.name}", host ${mongoose.connection.host}`);
  } catch (err: any) {
    console.warn('MongoDB Atlas connection failed:', (err.message || '').replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]'));
    console.log('Falling back to local data store...');
  }
}


// ── Laboratory orders ───────────────────────────────────────────────────────
const LAB_STATUSES = ['requested', 'collection_pending', 'collected', 'processing', 'awaiting_verification', 'verified', 'released', 'recollect_required', 'cancelled'];
const LAB_NEXT: Record<string, string[]> = {
  requested: ['collection_pending', 'collected', 'cancelled'],
  collection_pending: ['collected', 'recollect_required', 'cancelled'],
  collected: ['processing', 'awaiting_verification', 'recollect_required', 'cancelled'],
  processing: ['processing', 'awaiting_verification', 'recollect_required', 'cancelled'],
  awaiting_verification: ['processing', 'verified', 'released', 'recollect_required'],
  verified: ['released'],
  released: [],
  recollect_required: ['collection_pending', 'collected', 'cancelled'],
  cancelled: []
};
// Fields the laboratory may change on an order. Identity and ordering fields are fixed at creation.
const LAB_EDITABLE = ['sampleType', 'sampleContainer', 'sampleBarcode', 'collectedBy', 'technicianNotes', 'pathologistNotes', 'statusReason', 'results', 'consultantPathologist', 'headOfDepartment', 'handlingNote'];
const text = (v: any, max = 200) => String(v ?? '').trim().slice(0, max);

app.get('/api/lab/orders', roles('lab', 'doctor'), (req: any, res) => {
  const rows = [...db.labOrders].sort((a: any, b: any) => String(b.orderedAt).localeCompare(String(a.orderedAt)));
  audit(req, 'view', 'labOrder', 'list', `${rows.length} orders`);
  res.json({ data: rows });
});

app.get('/api/lab/orders/:id', roles('lab', 'doctor'), (req: any, res) => {
  const o = db.labOrders.find((x: any) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  audit(req, 'view', 'labOrder', o.id);
  res.json({ data: o });
});

app.post('/api/lab/orders', roles('lab', 'doctor', 'receptionist'), async (req: any, res) => {
  const b = req.body || {};
  const testName = text(b.testName);
  const patientName = text(b.patientName);
  const orderingDoctor = text(b.orderingDoctor);
  if (!testName || !patientName || !orderingDoctor) {
    return res.status(400).json({ error: 'Patient name, test and ordering doctor are required' });
  }
  const age = Number(b.patientAge);
  if (!Number.isFinite(age) || age < 0 || age > 130) return res.status(400).json({ error: 'Enter a valid patient age' });
  if (!['M', 'F', 'O'].includes(b.patientGender)) return res.status(400).json({ error: 'Select the patient gender' });

  // A registered patient id is linked to the real record; anything else stays a free-text lab requisition.
  const registered = b.patientId ? patientById(String(b.patientId)) : null;
  const orderId = `ORD-${Date.now().toString().slice(-7)}${crypto.randomInt(10, 99)}`;
  const o = {
    id: orderId,
    patientId: registered ? registered.patientId : text(b.patientId, 40) || `PT-${orderId.slice(4)}`,
    registeredPatientRef: registered ? registered.id : undefined,
    patientName: registered ? registered.name : patientName,
    patientAge: age,
    patientGender: b.patientGender,
    patientUhid: text(b.patientUhid, 40) || undefined,
    visitNo: text(b.visitNo, 40) || undefined,
    opIp: b.opIp === 'IP' ? 'IP' : 'OP',
    referralDoctor: text(b.referralDoctor) || orderingDoctor,
    encounterId: text(b.encounterId, 40) || `ENC-${orderId.slice(4)}`,
    testName,
    department: text(b.department) || undefined,
    orderingDoctor,
    orderedAt: now(),
    registrationAt: now(),
    status: 'requested',
    priority: b.priority === 'urgent' ? 'urgent' : 'routine',
    sampleType: text(b.sampleType) || undefined,
    sampleContainer: text(b.sampleContainer) || undefined,
    handlingNote: text(b.handlingNote, 500) || undefined,
    createdBy: req.user.id
  };
  db.labOrders.push(o);
  audit(req, 'create', 'labOrder', o.id, `${testName} · ${o.priority}`);
  await save();
  res.status(201).json({ data: o });
});

app.patch('/api/lab/orders/:id', roles('lab'), async (req: any, res) => {
  const o = db.labOrders.find((x: any) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const { status } = req.body || {};

  if (status) {
    if (!LAB_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
    if (!(LAB_NEXT[o.status] || []).includes(status)) {
      return res.status(409).json({ error: `An order that is "${o.status}" cannot move to "${status}"` });
    }
    if (['recollect_required', 'cancelled'].includes(status) && !text(req.body.statusReason)) {
      return res.status(400).json({ error: 'A reason is required to cancel or request a recollection' });
    }
    if (['awaiting_verification', 'verified', 'released'].includes(status)) {
      const results = req.body.results ?? o.results;
      if (!Array.isArray(results) || !results.some((r: any) => text(r?.value))) {
        return res.status(400).json({ error: 'Enter at least one result before sending for verification' });
      }
    }
  }

  for (const k of LAB_EDITABLE) {
    if (req.body?.[k] !== undefined) o[k] = k === 'results' ? req.body[k] : text(req.body[k], 1000);
  }
  if (status) {
    o.status = status;
    if (status === 'collected') { o.collectedAt = now(); o.collectedBy = o.collectedBy || req.user.name; }
    if (['processing', 'awaiting_verification'].includes(status)) o.processedBy = req.user.name;
    if (status === 'awaiting_verification') o.reportedAt = now();
    if (status === 'verified' || status === 'released') { o.verifiedBy = req.user.name; o.verifiedAt = now(); o.approvedAt = now(); }
    if (!['recollect_required', 'cancelled'].includes(status)) delete o.statusReason;
  }
  o.updatedAt = now();
  audit(req, status ? `status:${status}` : 'update', 'labOrder', o.id, status ? `${status}${o.statusReason ? ' · ' + o.statusReason : ''}` : 'Fields updated');
  await save();
  res.json({ data: o });
});


// ── Report scanning (Gemini runs on the server; the key never reaches the browser) ─────────────
const EXTRACT_PROMPT = `You are a clinical laboratory document parser.
Read this laboratory report image. Extract only what is printed on it into JSON of this shape:
{"patientName":"","patientUhid":"","visitNo":"","labNo":"","patientAge":0,"patientGender":"M|F|O","opIp":"OP|IP",
 "referralDoctor":"","orderingDoctor":"","testName":"","department":"","priority":"routine|urgent","impression":"",
 "results":[{"parameter":"","value":"","unit":"","referenceRange":"","methodology":"","subGroup":"","flag":"normal|abnormal|critical"}]}
Use "" or 0 for anything not printed. Never invent a value, name or range. Return JSON only.`;

const scanCache = new Map<string, unknown>(); // identical uploads reuse the result instead of spending quota

app.post('/api/lab/extract', roles('lab'), async (req: any, res) => {
  // Claude is used when ANTHROPIC_API_KEY is set (unless SCAN_PROVIDER=gemini); Gemini is the fallback.
  const useClaude = !!process.env.ANTHROPIC_API_KEY && process.env.SCAN_PROVIDER !== 'gemini';
  const key = process.env.GEMINI_API_KEY as string;
  if (!useClaude && !key) return res.status(503).json({ error: 'Report scanning is not configured. Set ANTHROPIC_API_KEY (or GEMINI_API_KEY) on the server.' });
  const mimeType = text(req.body?.mimeType, 60);
  const data = String(req.body?.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType) || !data) {
    return res.status(400).json({ error: 'Upload a JPG, PNG, WebP or PDF report' });
  }
  const fileKey = crypto.createHash('sha256').update(mimeType + data).digest('hex');
  if (scanCache.has(fileKey)) return res.json({ data: scanCache.get(fileKey), cached: true });
  if (useClaude) {
    try {
      const parsed = await extractWithClaude(mimeType, data);
      console.log(`[scan] claude -> ok (${mimeType}, ${Math.round(data.length * 0.75 / 1024)} KB)`);
      audit(req, 'scan', 'labReport', 'upload', `${mimeType} via claude`);
      scanCache.set(fileKey, parsed);
      if (scanCache.size > 50) scanCache.delete(scanCache.keys().next().value as string);
      await save();
      return res.json({ data: parsed });
    } catch (e: any) {
      const status = e instanceof ScanError ? e.status : 503;
      console.log(`[scan] claude -> ${status} (${mimeType})`);
      return res.status(status).json({ error: e instanceof ScanError ? e.message : 'The scanner is unavailable right now, try again shortly.' });
    }
  }
  const part = mimeType === 'application/pdf' ? { type: 'document', data, mime_type: mimeType } : { type: 'image', data, mime_type: mimeType };
  // Newer Gemini accounts use the Interactions API. If one model is overloaded, try the next.
  const models = [process.env.GEMINI_MODEL, 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash'].filter(Boolean) as string[];
  let busy = false;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
    busy = false;
    for (const model of models) {
      let r: Response;
      try {
        r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ model, input: [{ type: 'text', text: EXTRACT_PROMPT }, part], store: false }),
          signal: AbortSignal.timeout(30000)
        });
      } catch (e: any) {
        console.log(`[scan] ${model} -> ${e?.name || 'error'} (${mimeType}, ${Math.round(data.length * 0.75 / 1024)} KB)`);
        busy = true; // timed out or unreachable: try the next model
        continue;
      }
      console.log(`[scan] ${model} -> HTTP ${r.status} (${mimeType}, ${Math.round(data.length * 0.75 / 1024)} KB)`);
      if (r.status === 429) {
        const hours = Math.max(1, Math.round(Number(r.headers.get('retry-after') || 0) / 3600));
        return res.status(429).json({ error: `The scanner's free daily limit is used up. It resets in about ${hours} hour(s). Enter the results by hand, or ask the admin to use another API key.` });
      }
      if (r.status === 503) { busy = true; continue; }
      if (!r.ok) return res.status(422).json({ error: 'The scanner could not read this file' });
      const body: any = await r.json();
      const raw = (body.steps || [])
        .filter((st: any) => st.type === 'model_output')
        .flatMap((st: any) => st.content || [])
        .map((c: any) => c.text ?? '')
        .join('')
        .replace(/^```(?:json)?\s*|\s*```$/g, '');
      audit(req, 'scan', 'labReport', 'upload', `${mimeType} via ${model}`);
      await save();
      const parsed = JSON.parse(raw);
      scanCache.set(fileKey, parsed);
      if (scanCache.size > 50) scanCache.delete(scanCache.keys().next().value as string);
      return res.json({ data: parsed });
    }
    if (!busy) break;
    await new Promise((r) => setTimeout(r, 2500)); // every model was busy: wait briefly, then try the list once more
    }
    return res.status(busy ? 503 : 422).json({ error: busy ? 'The scanner is busy, try again shortly' : 'The scanner could not read this file' });
  } catch {
    res.status(422).json({ error: 'The scanner returned something unreadable. Enter the results by hand.' });
  }
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

const start = async () => {
  await initMongo();
  if (mongoConnected) {
    db = await loadFromMongo();
    if (!db.users.length) {
      db = await buildSeed();
      await save();
    }
  } else {
    db = await ensureSeed(DATA);
  }
  for (const c of COLLECTIONS) db[c] ||= [];
  for (const x of db.sessions) if (x.expires > Date.now()) sessions.set(x.id, { userId: x.userId, expires: x.expires });
  // Databases seeded before a role existed still need that role's demo account.
  const seeded = (await buildSeed()).users;
  const missing = seeded.filter((u: any) => !db.users.some((x: any) => x.email === u.email));
  if (missing.length) {
    db.users.push(...missing);
    await save();
  }
  app.listen(PORT, () =>
    console.log(`CareWeave API listening on http://localhost:${PORT} [DB: ${mongoConnected ? 'MongoDB Atlas' : 'Local JSON'}]`)
  );
};

start();
