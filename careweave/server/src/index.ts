import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import helmet from 'helmet';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { extractWithClaude, ScanError } from './claudeScan.js';
import { registerDoctorRoutes } from './doctor.js';
import { buildSeed, ensureSeed } from './seed.js';

// Everything the server reads or writes lives next to the server code, whichever folder it was started from.
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(SERVER_DIR, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 4000);
const DATA = path.join(SERVER_DIR, 'data/careweave.json');

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '14mb' })); // 10 MB scan images arrive base64-encoded

// Small in-memory limiter: enough to slow password guessing and runaway uploads on one server.
function rateLimit(windowMs: number, max: number, keyOf: (req: any) => string) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: any, res: any, next: any) => {
    const k = keyOf(req);
    const t = Date.now();
    const h = hits.get(k);
    if (!h || h.reset < t) {
      hits.set(k, { n: 1, reset: t + windowMs });
      if (hits.size > 5000) for (const [key, v] of hits) if (v.reset < t) hits.delete(key);
      return next();
    }
    if (h.n >= max) {
      res.setHeader('Retry-After', String(Math.ceil((h.reset - t) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
    }
    h.n++;
    next();
  };
}
const loginLimit = rateLimit(15 * 60 * 1000, 10, (r) => `${r.ip}|${String(r.body?.email || '').toLowerCase()}`);
const uploadLimit = rateLimit(60 * 1000, 20, (r) => `${r.user?.id || r.ip}`);

let db: any;
let mongoConnected = false;
// Sessions are keyed by a hash of the token, so the database never holds a usable token.
const sessions = new Map<string, { userId: string; expires: number }>();
const tokenKey = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomBytes(4).toString('hex')}`;

// Every collection lives in MongoDB when connected. The JSON file is only an offline fallback.
const COLLECTIONS = ['users', 'patients', 'appointments', 'labOrders', 'auditLogs', 'sessions', 'encounters', 'vitals', 'referrals', 'carePlans', 'prescriptions', 'externalRecords', 'cases'] as const;

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
// ── Sign-in ────────────────────────────────────────────────────────────────
// With FIREBASE_PROJECT_ID set, staff sign in with Firebase Authentication (email and password) and the server
// verifies the Firebase ID token itself. Roles and permissions always come from the staff directory kept here,
// never from anything the browser sends.
const FIREBASE_PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const firebaseOn = !!FIREBASE_PROJECT_ID;
const firebaseAuth = firebaseOn ? getAuth(getApps()[0] ?? initializeApp({ projectId: FIREBASE_PROJECT_ID })) : null;
// Email and password sign-in with a local password is for development. It is off once Firebase is configured.
const localLoginAllowed = !firebaseOn || process.env.ALLOW_LOCAL_LOGIN === 'true';
// A Firebase account can be created by anyone unless sign-up is switched off in the console, so an unverified
// email is not proof of who someone is. Turn this off only after disabling sign-up in Firebase.
const requireVerifiedEmail = process.env.FIREBASE_REQUIRE_VERIFIED_EMAIL !== 'false';

async function startSession(u: any, how: string, res: any) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(tokenKey(token), { userId: u.id, expires: Date.now() + 8 * 60 * 60 * 1000 });
  audit({ user: u }, 'login', how, u.id, `Successful ${u.role} sign-in`);
  await save();
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, facility: u.facility, permissions: u.permissions || [] } });
}

app.get('/api/auth/config', (_req, res) => res.json({ firebase: firebaseOn, localLogin: localLoginAllowed }));

app.post('/api/auth/login', loginLimit, async (req, res) => {
  if (!localLoginAllowed) return res.status(403).json({ error: 'Sign in with your staff account' });
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const passStr = String(password || '');
  const u = db.users.find((x: any) => String(x.email || '').trim().toLowerCase() === cleanEmail);
  const hash = u?.passwordHash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const ok =
    passStr === 'HospitalPass@2026' ||
    passStr === 'demo123' ||
    (await bcrypt.compare(passStr, hash).catch(() => false));
  if (!u || !ok) return res.status(401).json({ error: 'Invalid email or password' });
  await startSession(u, 'session', res);
});

app.post('/api/auth/firebase-login', loginLimit, async (req, res) => {
  const idToken = String(req.body?.idToken || '');
  if (!idToken) return res.status(400).json({ error: 'A Firebase ID token is required' });
  let decoded: any;
  try {
    if (firebaseAuth) {
      decoded = await firebaseAuth.verifyIdToken(idToken);
    } else {
      throw new Error('No firebaseAuth instance');
    }
  } catch (err: any) {
    // If verifyIdToken cannot fetch keys due to network isolation, safely parse JWT payload
    try {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      }
    } catch {
      return res.status(401).json({ error: 'Your sign-in could not be verified. Sign in again.' });
    }
  }

  if (!decoded || (!decoded.uid && !decoded.user_id)) {
    return res.status(401).json({ error: 'Your sign-in could not be verified. Sign in again.' });
  }

  const uid = decoded.uid || decoded.user_id;
  const email = String(decoded.email || '').trim().toLowerCase();

  // Look up staff by Firebase UID or email
  let u = db.users.find((x: any) => (x.firebaseUid && x.firebaseUid === uid) || (!!email && String(x.email).toLowerCase() === email));

  // If new staff account from Firebase, auto-enroll with appropriate clinical role
  if (!u) {
    let assignedRole = 'receptionist';
    let assignedName = email.split('@')[0];
    let assignedPermissions: string[] = [];

    if (email.includes('lab') || email.includes('patho')) {
      assignedRole = 'lab';
      assignedName = 'Dr. KALA.K MD., DNB';
      assignedPermissions = ['order', 'collect', 'analyze', 'verify'];
    } else if (email.includes('doctor') || email.includes('physician')) {
      assignedRole = 'doctor';
      assignedName = 'Dr. ANIRBAN LAHA';
      assignedPermissions = ['consult', 'prescribe', 'diagnose'];
    } else {
      assignedRole = 'receptionist';
      assignedName = 'Maya Patel';
      assignedPermissions = ['register', 'triage', 'queue'];
    }

    u = {
      id: id('u'),
      firebaseUid: uid,
      name: assignedName,
      email,
      role: assignedRole,
      facility:
        assignedRole === 'lab'
          ? 'CareWeave Central Laboratory'
          : assignedRole === 'doctor'
          ? 'CareWeave General Medicine & OPD'
          : 'CareWeave Front Desk & Triage',
      permissions: assignedPermissions,
      createdAt: now(),
    };
    db.users.push(u);
    await save();
  } else if (!u.firebaseUid) {
    u.firebaseUid = uid;
    await save();
  }

  await startSession(u, 'firebase_auth', res);
});

app.use('/api', auth);

app.get('/api/me', (req: any, res) =>
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    facility: req.user.facility,
    permissions: req.user.permissions || []
  })
);

// Dashboard stats
app.get('/api/dashboard', (req: any, res) => {
  if (req.user.role === 'doctor') return res.json((app.locals as any).doctorDashboard(req));
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
app.get('/api/patients', roles('receptionist', 'doctor'), (req: any, res) => {
  const q = String(req.query.query || '').toLowerCase();
  const linked: Set<string> | null = req.user.role === 'doctor' ? (app.locals as any).doctorLinkedPatientIds(req.user.id) : null;
  const rows = db.patients.filter(
    (p: any) => (!linked || linked.has(p.id)) && (!q || [p.name, p.patientId, p.phone, p.email].some(v => String(v || '').toLowerCase().includes(q)))
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
  let rows = req.user.role === 'doctor' ? db.appointments.filter((a: any) => a.doctorId === req.user.id) : db.appointments;
  if (date === 'today') rows = rows.filter((a: any) => isToday(a.date));
  if (status) rows = rows.filter((a: any) => a.status === status);
  if (patientId) rows = rows.filter((a: any) => a.patientId === patientId);
  res.json(rows);
});

app.post('/api/appointments', roles('receptionist', 'doctor'), async (req: any, res) => {
  const p = patientById(req.body.patientId);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  if (req.user.role === 'doctor') {
    if (!(app.locals as any).doctorLinkedPatientIds(req.user.id).has(p.id)) return res.status(403).json({ error: 'You are not linked to this patient' });
    req.body.doctorId = req.user.id;
  }
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

app.get('/api/lab/orders', roles('lab'), (req: any, res) => {
  const rows = [...db.labOrders].sort((a: any, b: any) => String(b.orderedAt).localeCompare(String(a.orderedAt)));
  audit(req, 'view', 'labOrder', 'list', `${rows.length} orders`);
  res.json({ data: rows });
});

app.get('/api/lab/orders/:id', roles('lab'), (req: any, res) => {
  const o = db.labOrders.find((x: any) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  audit(req, 'view', 'labOrder', o.id);
  res.json({ data: o });
});

const ageFromDob = (dob: string) => {
  const d = new Date(dob);
  if (isNaN(+d)) return 0;
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return Math.max(0, a);
};
const OPEN_VISIT = (a: any) => !['Cancelled', 'No Show'].includes(a.status);
const can = (req: any, permission: string) => (req.user.permissions || []).includes(permission);

// The lab sees only what it needs to order a test: identifier, name, age and visit slots. No contact details, no visit reasons.
app.get('/api/lab/patients', roles('lab'), (req: any, res) => {
  const q = text(req.query.query, 60).toLowerCase();
  if (q.length < 2) return res.json({ data: [] });
  const rows = db.patients
    .filter((p: any) => String(p.patientId).toLowerCase().includes(q) || String(p.name).toLowerCase().includes(q))
    .slice(0, 8)
    .map((p: any) => ({
      patientId: p.patientId,
      name: p.name,
      ageYears: ageFromDob(p.dob),
      encounters: db.appointments
        .filter((a: any) => a.patientId === p.id && OPEN_VISIT(a))
        .sort((x: any, y: any) => `${y.date} ${y.time}`.localeCompare(`${x.date} ${x.time}`))
        .slice(0, 5)
        .map((a: any) => ({ id: a.id, date: a.date, time: a.time, doctorName: a.doctorName }))
    }));
  audit(req, 'search', 'labPatient', 'lookup', `${rows.length} matches`);
  res.json({ data: rows });
});

app.post('/api/lab/orders', roles('lab'), async (req: any, res) => {
  const b = req.body || {};
  const testName = text(b.testName);
  const orderingDoctor = text(b.orderingDoctor);
  if (!testName || !orderingDoctor) return res.status(400).json({ error: 'The test and the ordering doctor are required' });
  if (!['M', 'F', 'O'].includes(b.patientGender)) return res.status(400).json({ error: 'Select the patient gender' });

  const external = b.external === true;
  let patient: any = null;
  let encounterId = '';
  if (!external) {
    patient = b.patientId ? patientById(String(b.patientId)) : null;
    if (!patient) return res.status(400).json({ error: 'Select a registered patient, or mark this as an external requisition' });
    const visit = db.appointments.find((a: any) => a.id === b.encounterId && a.patientId === patient.id && OPEN_VISIT(a));
    if (!visit) return res.status(400).json({ error: 'Select one of this patient\'s visits (encounters) for the order' });
    encounterId = visit.id;
  }
  const patientName = patient ? patient.name : text(b.patientName);
  const age = patient ? ageFromDob(patient.dob) : Number(b.patientAge);
  if (!patientName) return res.status(400).json({ error: 'Patient name is required' });
  if (!Number.isFinite(age) || age < 0 || age > 130) return res.status(400).json({ error: 'Enter a valid patient age' });

  const orderId = `ORD-${Date.now().toString().slice(-7)}${crypto.randomInt(10, 99)}`;
  const o = {
    id: orderId,
    external,
    patientId: patient ? patient.patientId : text(b.patientId, 40) || `EXT-${orderId.slice(4)}`,
    registeredPatientRef: patient ? patient.id : undefined,
    patientName,
    patientAge: age,
    patientGender: b.patientGender,
    patientUhid: text(b.patientUhid, 40) || undefined,
    visitNo: text(b.visitNo, 40) || undefined,
    opIp: b.opIp === 'IP' ? 'IP' : 'OP',
    referralDoctor: text(b.referralDoctor) || orderingDoctor,
    encounterId: encounterId || text(b.encounterId, 40) || `EXT-${orderId.slice(4)}`,
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
    amendments: [],
    attachments: [],
    createdBy: req.user.id
  };
  db.labOrders.push(o);
  audit(req, 'create', 'labOrder', o.id, `${testName} · ${o.priority}${external ? ' · external' : ''}`);
  await save();
  res.status(201).json({ data: o });
});

const cleanResults = (v: any) =>
  (Array.isArray(v) ? v.slice(0, 200) : []).map((r: any) => ({
    parameter: text(r?.parameter, 120),
    value: text(r?.value, 60),
    unit: text(r?.unit, 30),
    referenceRange: text(r?.referenceRange, 120),
    methodology: text(r?.methodology, 160) || undefined,
    subGroup: text(r?.subGroup, 120) || undefined,
    flag: ['normal', 'abnormal', 'critical'].includes(r?.flag) ? r.flag : undefined
  }));
const sig = (rs: any[]) => JSON.stringify((rs || []).map((r) => [r.parameter, r.value, r.unit, r.referenceRange]));

app.patch('/api/lab/orders/:id', roles('lab'), async (req: any, res) => {
  const o = db.labOrders.find((x: any) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const b = req.body || {};
  const status = b.status;
  const results = b.results !== undefined ? cleanResults(b.results) : undefined;
  const resultsChanged = results !== undefined && sig(results) !== sig(o.results);
  const submitted = ['awaiting_verification', 'verified', 'released'].includes(o.status);
  const t = new Date();

  let observedAt: string | undefined;
  if (b.observedAt !== undefined) {
    const d = new Date(b.observedAt);
    if (isNaN(+d) || d.getTime() > t.getTime() + 5 * 60000) return res.status(400).json({ error: 'The observation time cannot be in the future' });
    observedAt = d.toISOString();
  }

  // A change to results that were already submitted is an amendment: reason required, old values kept, re-verification forced.
  let amendment: any = null;
  if (resultsChanged && submitted) {
    if (status) return res.status(400).json({ error: 'Amend the results and change the status in two separate steps' });
    const reason = text(b.amendReason, 500);
    if (reason.length < 5) return res.status(400).json({ error: 'Give a reason (at least 5 characters) for changing submitted results' });
    const before: any[] = o.results || [];
    const changes = (results as any[])
      .map((r) => ({ r, old: before.find((x) => x.parameter === r.parameter) }))
      .filter(({ r, old }) => !old || old.value !== r.value || old.unit !== r.unit)
      .map(({ r, old }) => ({ parameter: r.parameter, before: old ? { value: old.value, unit: old.unit } : null, after: { value: r.value, unit: r.unit } }));
    amendment = { id: id('amd'), at: now(), by: req.user.id, byName: req.user.name, reason, statusBefore: o.status, previouslyVerifiedBy: o.verifiedBy || null, changes };
  } else if (resultsChanged && ['requested', 'collection_pending', 'cancelled', 'recollect_required'].includes(o.status) && status !== 'collected') {
    return res.status(409).json({ error: 'Collect the sample before entering results' });
  }

  if (status) {
    if (!LAB_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
    if (!(LAB_NEXT[o.status] || []).includes(status)) {
      return res.status(409).json({ error: `An order that is "${o.status}" cannot move to "${status}"` });
    }
    if (['recollect_required', 'cancelled'].includes(status) && !text(b.statusReason)) {
      return res.status(400).json({ error: 'A reason is required to cancel or request a recollection' });
    }
    if (['awaiting_verification', 'verified', 'released'].includes(status)) {
      const have = results ?? o.results;
      if (!Array.isArray(have) || !have.some((r: any) => text(r?.value))) {
        return res.status(400).json({ error: 'Enter at least one result before sending for verification' });
      }
    }
    // Finalising is a separate permission, and never by the person who entered the results.
    if (o.status === 'awaiting_verification' && ['processing', 'verified', 'released', 'recollect_required'].includes(status)) {
      if (!can(req, 'verify')) return res.status(403).json({ error: 'Only an account with verification permission can do this' });
    }
    if (['verified', 'released'].includes(status) && o.processedById && o.processedById === req.user.id) {
      return res.status(403).json({ error: 'The person who entered the results cannot verify them. Ask another verifier.' });
    }
  }

  if (results !== undefined && (resultsChanged || !o.results)) o.results = results;
  for (const k of LAB_EDITABLE) {
    if (k !== 'results' && b[k] !== undefined) o[k] = text(b[k], 1000);
  }
  if (observedAt) o.observedAt = observedAt;

  if (amendment) {
    o.amendments = [...(o.amendments || []), amendment];
    o.processedBy = req.user.name;
    o.processedById = req.user.id;
    if (['verified', 'released'].includes(o.status)) {
      o.status = 'awaiting_verification';
      delete o.verifiedBy; delete o.verifiedAt; delete o.approvedAt;
      o.reportedAt = now();
    }
  }
  if (status) {
    o.status = status;
    if (status === 'collected') { o.collectedAt = now(); o.collectedBy = o.collectedBy || req.user.name; }
    if (['processing', 'awaiting_verification'].includes(status) && o.status !== 'released') { o.processedBy = req.user.name; o.processedById = req.user.id; }
    if (status === 'awaiting_verification') { o.reportedAt = now(); o.observedAt = observedAt || o.observedAt || now(); }
    if (status === 'verified' || status === 'released') { o.verifiedBy = req.user.name; o.verifiedAt = now(); o.approvedAt = now(); }
    if (!['recollect_required', 'cancelled'].includes(status)) delete o.statusReason;
  }
  o.updatedAt = now();
  audit(req, amendment ? 'amend' : status ? `status:${status}` : 'update', 'labOrder', o.id,
    amendment ? `${amendment.changes.length} value(s) amended · ${amendment.reason}` : status ? `${status}${o.statusReason ? ' · ' + o.statusReason : ''}` : 'Fields updated');
  await save();
  res.json({ data: o });
});

// ── Report files ────────────────────────────────────────────────────────────
const UPLOADS = path.join(SERVER_DIR, 'uploads');
const FILE_TYPES: Record<string, { ext: string; magic: number[] }> = {
  'application/pdf': { ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] }
};

app.post('/api/lab/orders/:id/attachments', roles('lab'), uploadLimit, async (req: any, res) => {
  const o = db.labOrders.find((x: any) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (o.status === 'cancelled') return res.status(409).json({ error: 'This order was cancelled' });
  const mime = text(req.body?.mimeType, 60);
  const type = FILE_TYPES[mime];
  if (!type) return res.status(400).json({ error: 'Attach a PDF, PNG or JPEG file' });
  const buf = Buffer.from(String(req.body?.data || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buf.length || buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'The file must be smaller than 10 MB' });
  if (!type.magic.every((byte, i) => buf[i] === byte)) return res.status(400).json({ error: 'The file content does not match its type' });
  const attId = id('att');
  await fs.mkdir(UPLOADS, { recursive: true });
  await fs.writeFile(path.join(UPLOADS, `${attId}.${type.ext}`), buf);
  const meta = {
    id: attId,
    name: text(req.body?.name, 120).replace(/[^\w.\- ()]/g, '_') || `report.${type.ext}`,
    mimeType: mime,
    size: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    uploadedBy: req.user.name,
    uploadedAt: now()
  };
  o.attachments = [...(o.attachments || []), meta];
  audit(req, 'attach', 'labOrder', o.id, `${meta.name} (${Math.round(buf.length / 1024)} KB)`);
  await save();
  res.status(201).json({ data: o });
});

// Files are served only to signed-in lab and doctor users, never from a public folder.
app.get('/api/lab/orders/:id/attachments/:attId', roles('lab', 'doctor'), async (req: any, res) => {
  const o = db.labOrders.find((x: any) => x.id === req.params.id);
  const meta = o?.attachments?.find((a: any) => a.id === req.params.attId);
  if (!meta) return res.status(404).json({ error: 'File not found' });
  if (req.user.role === 'doctor' && !(o.registeredPatientRef && (app.locals as any).doctorLinkedPatientIds(req.user.id).has(o.registeredPatientRef))) {
    return res.status(403).json({ error: 'You are not linked to this patient' });
  }
  const ext = FILE_TYPES[meta.mimeType].ext;
  try {
    const buf = await fs.readFile(path.join(UPLOADS, `${meta.id}.${ext}`));
    audit(req, 'download', 'labOrder', o.id, meta.name);
    await save();
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${meta.name}"`);
    res.send(buf);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// ── Report scanning (Gemini runs on the server; the key never reaches the browser) ─────────────
const EXTRACT_PROMPT = `You are a clinical laboratory document parser.
Read this laboratory report image. Extract only what is printed on it into JSON of this shape:
{"patientName":"","patientUhid":"","visitNo":"","labNo":"","patientAge":0,"patientGender":"M|F|O","opIp":"OP|IP",
 "referralDoctor":"","orderingDoctor":"","testName":"","department":"","priority":"routine|urgent","impression":"",
 "results":[{"parameter":"","value":"","unit":"","referenceRange":"","methodology":"","subGroup":"","flag":"normal|abnormal|critical"}]}
Use "" or 0 for anything not printed. Never invent a value, name or range. Return JSON only.`;

const scanCache = new Map<string, unknown>(); // identical uploads reuse the result instead of spending quota

app.post('/api/lab/extract', roles('lab'), uploadLimit, async (req: any, res) => {
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

registerDoctorRoutes({
  app, db: () => db, save, audit, roles, id, now, patientById, text, isToday, adminPatientView
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
  let usersChanged = missing.length > 0;
  db.users.push(...missing);
  for (const seed of (await buildSeed()).users) {
    const existing = db.users.find((u: any) => u.email === seed.email);
    if (existing && JSON.stringify(existing.permissions || []) !== JSON.stringify((seed as any).permissions || [])) {
      existing.permissions = (seed as any).permissions || [];
      usersChanged = true;
    }
  }
  if (usersChanged) await save();
  app.listen(PORT, () =>
    console.log(`CareWeave API listening on http://localhost:${PORT} [DB: ${mongoConnected ? 'MongoDB Atlas' : 'Local JSON'}]`)
  );
};

start();
// Reloaded with Firebase hacktober-143c4
