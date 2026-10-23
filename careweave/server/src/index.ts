import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { ensureSeed } from './seed.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const DATA = path.resolve('data/careweave.json');

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '2mb' }));

let db: any;
let mongoConnected = false;
const sessions = new Map<string, { userId: string; expires: number }>();

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomBytes(4).toString('hex')}`;

async function save() {
  await fs.mkdir(path.dirname(DATA), { recursive: true });
  await fs.writeFile(DATA, JSON.stringify(db, null, 2));
}

function user(req: any) {
  const raw = String(req.headers.authorization || '').replace('Bearer ', '');
  const s = sessions.get(raw);
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
  sessions.set(token, { userId: u.id, expires: Date.now() + 8 * 60 * 60 * 1000 });
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
app.get('/api/patients', roles('receptionist', 'doctor'), (req: any, res) => {
  const q = String(req.query.query || '').toLowerCase();
  const rows = db.patients.filter(
    (p: any) => !q || [p.name, p.patientId, p.phone, p.email].some(v => String(v || '').toLowerCase().includes(q))
  );
  audit(req, 'search', 'patient', 'directory', q ? 'Search by permitted identifiers' : 'Open patient directory');
  res.json(rows.map(adminPatientView));
});

app.post('/api/patients', roles('receptionist'), async (req: any, res) => {
  const { name, dob, phone, email, emergencyContact, _forceCreate, risk } = req.body || {};
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

app.get('/api/patients/:id/admin', roles('receptionist'), (req: any, res) => {
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
  res.json({ ...adminPatientView(p), appointments });
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
app.get('/api/doctors', roles('receptionist', 'doctor'), (req: any, res) => {
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

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

const start = async () => {
  await initMongo();
  db = await ensureSeed(DATA);
  app.listen(PORT, () =>
    console.log(`CareWeave API listening on http://localhost:${PORT} [DB: ${mongoConnected ? 'MongoDB Atlas' : 'Local JSON'}]`)
  );
};

start();
