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
import { registerScanRoutes } from './scanRoutes.js';
import { implausibleValue } from './labRules.js';
import { runScenario } from './scenario.js';
import { registerDoctorRoutes } from './doctor.js';
import { importMedicines } from './medicines.js';
import { buildSeed, ensureSeed } from './seed.js';
import { registerExasolAnalyticsRoutes } from './exasol/routes.js';

// Everything the server reads or writes lives next to the server code, whichever folder it was started from.
const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(SERVER_DIR, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 4000);
const DATA = isVercel ? '/tmp/careweave.json' : path.join(SERVER_DIR, 'data/careweave.json');

if (!isVercel) {
  app.use(helmet({ contentSecurityPolicy: false }));
}
app.use(cors({ origin: true, credentials: true }));
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
const COLLECTIONS = ['users', 'patients', 'appointments', 'labOrders', 'auditLogs', 'sessions', 'encounters', 'vitals', 'referrals', 'carePlans', 'prescriptions', 'externalRecords', 'cases', 'syntheticHistory'] as const;

// What each document looked like the last time it was written, so a save sends only what changed.
const written = new Map<string, Map<string, string>>();
const remember = (c: string, docs: any[]) => written.set(c, new Map(docs.map((d) => [d.id, JSON.stringify(d)])));

async function loadFromMongo() {
  const out: any = {};
  for (const c of COLLECTIONS) {
    out[c] = await mongoose.connection.db!.collection(c).find({}, { projection: { _id: 0 } }).toArray();
    remember(c, out[c]);
  }
  return out;
}

// Transactions need a replica set (Atlas always is). A standalone local mongod cannot run them.
let txSupported: boolean | undefined;
async function canTransact() {
  if (txSupported === undefined) {
    const hello: any = await mongoose.connection.db!.admin().command({ hello: 1 });
    txSupported = !!(hello.setName || hello.msg === 'isdbgrid');
  }
  return txSupported;
}

// One save is one unit: every changed document across every collection is written together, or (on a replica set)
// not at all. The "last written" snapshot only moves forward after the write succeeded, so a failed save is retried
// with the same changes on the next one.
async function saveToMongo() {
  const plan: { c: string; changed: any[]; removed: string[]; after: Map<string, string> }[] = [];
  for (const c of COLLECTIONS) {
    const docs: any[] = db[c] || [];
    const before = written.get(c) ?? new Map<string, string>();
    const after = new Map<string, string>();
    const changed: any[] = [];
    for (const d of docs) {
      const json = JSON.stringify(d);
      after.set(d.id, json);
      if (before.get(d.id) !== json) changed.push(d);
    }
    const removed = [...before.keys()].filter((k) => !after.has(k));
    plan.push({ c, changed, removed, after });
  }
  const apply = async (session?: any) => {
    for (const { c, changed, removed } of plan) {
      const coll = mongoose.connection.db!.collection(c);
      if (changed.length) await coll.bulkWrite(changed.map((d) => ({ replaceOne: { filter: { id: d.id }, replacement: d, upsert: true } })), { session });
      if (removed.length) await coll.deleteMany({ id: { $in: removed } }, { session });
    }
  };
  if (plan.some((p) => p.changed.length || p.removed.length)) {
    if (await canTransact()) {
      const session = mongoose.connection.getClient().startSession();
      try { await session.withTransaction(() => apply(session)); } finally { await session.endSession(); }
    } else {
      await apply();
    }
  }
  for (const p of plan) written.set(p.c, p.after);
}

// Indexes the lookups rely on. Failure here is not fatal: the server still works, only slower.
async function ensureIndexes() {
  try {
    const d = mongoose.connection.db!;
    for (const c of COLLECTIONS) await d.collection(c).createIndex({ id: 1 }, { unique: true });
    await d.collection('patients').createIndex({ patientId: 1 });
    await d.collection('appointments').createIndex({ doctorId: 1, date: 1, time: 1 });
    await d.collection('labOrders').createIndex({ status: 1 });
  } catch (err: any) {
    console.warn('Could not create indexes:', err?.message);
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
    // Write a temp file, then rename it over the real one. A crash mid-write leaves the old file intact.
    const tmp = `${DATA}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, DATA);
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
    risk: p.risk,
    rev: p.rev || 0
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
  const u = db.users.find((x: any) => String(x.email || '').trim().toLowerCase() === cleanEmail);
  // Always run a bcrypt compare so an unknown email and a wrong password look and time the same.
  const hash = u?.passwordHash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const ok = await bcrypt.compare(String(password || ''), hash).catch(() => false);
  if (!u || !u.passwordHash || !ok) return res.status(401).json({ error: 'Invalid email or password' });
  await startSession(u, 'session', res);
});

if (firebaseAuth) {
  app.post('/api/auth/firebase-login', loginLimit, async (req, res) => {
    const idToken = String(req.body?.idToken || '');
    if (!idToken) return res.status(400).json({ error: 'A Firebase ID token is required' });
    let decoded: any;
    try {
      // verifyIdToken checks the signature, issuer, audience and expiry. A token that fails is never trusted.
      decoded = await firebaseAuth.verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ error: 'Your sign-in could not be verified. Sign in again.' });
    }
    const uid = String(decoded.uid || '');
    const email = String(decoded.email || '').trim().toLowerCase();
    if (!uid || !email) return res.status(401).json({ error: 'Your sign-in could not be verified. Sign in again.' });

    // Only people already in the staff directory can sign in. Roles and permissions come from there, never from the token.
    const u = db.users.find((x: any) => String(x.email || '').trim().toLowerCase() === email);
    if (!u) return res.status(403).json({ error: 'This account is not registered as CareWeave staff. Ask an administrator.' });
    if (u.firebaseUid && u.firebaseUid !== uid) return res.status(403).json({ error: 'This email is linked to a different sign-in account.' });
    if (!u.firebaseUid) {
      if (requireVerifiedEmail && decoded.email_verified !== true) {
        return res.status(403).json({ error: 'Verify your email address first, then sign in again.' });
      }
      u.firebaseUid = uid;
      await save();
    }
    await startSession(u, 'firebase_auth', res);
  });
} else {
  app.post('/api/auth/firebase-login', (_req, res) => res.status(404).json({ error: 'Not found' }));
}

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
  // Paged so a large directory never goes to the browser in one response.
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  res.setHeader('X-Total-Count', String(rows.length));
  res.json(rows.slice(offset, offset + limit).map(adminPatientView));
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
    gender: ['M', 'F', 'O'].includes(gender) ? gender : 'O',
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
  const { name, phone, email, emergencyContact, rev } = req.body || {};
  // A form opened before someone else saved must not overwrite their change.
  if (rev !== undefined && Number(rev) !== (p.rev || 0)) return res.status(409).json({ error: 'This patient was changed by someone else while you were editing. Reload and try again.' });
  p.rev = (p.rev || 0) + 1;
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
  // Checked and added with no await in between, so two requests at the same moment cannot both take the slot.
  const taken = doctor && db.appointments.find((x: any) => x.doctorId === doctor.id && x.date === date && x.time === time && !['Cancelled', 'Completed', 'No Show'].includes(x.status));
  if (taken) return res.status(409).json({ error: `${doctor.name} already has a booking at ${time} on ${date}. Choose another time.` });
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
  const { status, date, time, reason, rev } = req.body;
  if (rev !== undefined && Number(rev) !== (a.rev || 0)) return res.status(409).json({ error: 'This appointment was changed by someone else. Reload and try again.' });
  // Check the new slot before changing anything, so a refusal leaves the appointment untouched.
  const nd = date || a.date, nt = time || a.time;
  const taken = (date || time) && a.doctorId && db.appointments.find((x: any) => x.id !== a.id && x.doctorId === a.doctorId && x.date === nd && x.time === nt && !['Cancelled', 'Completed', 'No Show'].includes(x.status));
  if (taken) return res.status(409).json({ error: `${a.doctorName} already has a booking at ${nt} on ${nd}. Choose another time.` });
  const validStatuses = ['Scheduled', 'Checked In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled', 'No Show'];
  if (status) {
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid appointment status' });
    if (status === a.status) return res.status(409).json({ error: `Patient is already marked as ${status}` });
    a.status = status;
    if ((status === 'Checked In' || status === 'Waiting') && !a.checkedInAt) a.checkedInAt = now();
    // Analytics measures the wait as check-in to the start of the consultation, so both moments are recorded.
    if (status === 'In Consultation' && !a.startedAt) a.startedAt = now();
    if (status === 'Completed' && !a.completedAt) a.completedAt = now();
  }
  if (date || time) {
    if (!['Scheduled'].includes(a.status) && !status) {
      return res.status(400).json({ error: 'Only scheduled appointments can be rescheduled' });
    }
    a.date = nd;
    a.time = nt;
    a.rescheduledAt = now();
  }
  if (reason) a.reason = String(reason).trim();
  a.rev = (a.rev || 0) + 1;
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
  for (const r of results ?? []) {
    const bad = implausibleValue(r.parameter, r.value, r.unit);
    if (bad) return res.status(400).json({ error: bad });
  }
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
      if (!can(req, 'verify')) {
        audit(req, 'blocked', 'labOrder', o.id, 'Maker-checker: user without verification permission tried to finalise a result');
        await save();
        return res.status(403).json({ error: 'Only an account with verification permission can do this' });
      }
    }
    if (['verified', 'released'].includes(status) && o.processedById && o.processedById === req.user.id) {
      audit(req, 'blocked', 'labOrder', o.id, 'Maker-checker: the person who entered the results tried to verify them');
      await save();
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
const UPLOADS = isVercel ? '/tmp/uploads' : path.join(SERVER_DIR, 'uploads');
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

// ── Synthetic sample scenario ───────────────────────────────────────────────
// One labelled, made-up patient journey for demonstrations. Off when ALLOW_SAMPLE_DATA=false.
const sampleAllowed = process.env.ALLOW_SAMPLE_DATA !== 'false';
let scenarioRunning = false;
app.get('/api/demo/scenario', (_req, res) => res.json({ available: sampleAllowed, loaded: db.patients.some((p: any) => p.sample) }));
app.post('/api/demo/scenario', roles('receptionist', 'doctor', 'lab'), async (req: any, res) => {
  if (!sampleAllowed) return res.status(403).json({ error: 'Sample data is switched off on this server' });
  if (scenarioRunning) return res.status(409).json({ error: 'The sample scenario is already loading' });
  scenarioRunning = true;
  try {
    const mint = (userId: string) => {
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(tokenKey(token), { userId, expires: Date.now() + 5 * 60 * 1000 });
      return token;
    };
    const out = await runScenario(`http://127.0.0.1:${PORT}`, db.users, db.patients, mint, req.user);
    if (out.loaded) {
      const p = db.patients.find((x: any) => x.patientId === out.patientId);
      if (p) p.sample = true;
      audit(req, 'create', 'sample-scenario', out.patientId || '', 'Loaded synthetic sample scenario');
      await save();
    }
    res.status(out.loaded ? 201 : 200).json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not load the sample scenario' });
  } finally {
    scenarioRunning = false;
  }
});

registerScanRoutes({ app, roles, uploadLimit, text, audit, save, mongoConnected: () => mongoConnected });
registerDoctorRoutes({
  app, db: () => db, save, audit, roles, id, now, patientById, text, isToday, adminPatientView, mongoConnected: () => mongoConnected
});
registerExasolAnalyticsRoutes({ app, db: () => db, roles, audit, save, sampleAllowed });

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

let initPromise: Promise<void> | null = null;
export async function ensureInitialized() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await initMongo();
    if (mongoConnected) {
      await ensureIndexes();
      importMedicines().catch((err) => console.warn('Medicine import failed:', err?.message));
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
  })();
  return initPromise;
}

export { app };
export default app;

if (!isVercel) {
  ensureInitialized().then(() => {
    app.listen(PORT, () =>
      console.log(`CareWeave API listening on http://localhost:${PORT} [DB: ${mongoConnected ? 'MongoDB Atlas' : 'Local JSON'}]`)
    );
  }).catch((err) => {
    console.error('Failed to start CareWeave API:', err);
  });
}
