import crypto from 'node:crypto';
import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { linkedPatientIds } from '../services/access.js';
import { MAX_SIGNALS_PER_CONSULT, SIGNAL_TYPES } from '../repo/videoConsults.js';
import { sendWhatsAppText } from '../whatsapp/emitter.js';
import { id, now } from '../util.js';

const CONSULT_MINUTES = 120;
const MAX_SIGNAL_BYTES = 24_000; // a session description is about 5 to 10 KB
const random = (bytes: number) => crypto.randomBytes(bytes).toString('base64url');
const sameSecret = (a: unknown, b: unknown) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/** The address the patient should open: PUBLIC_APP_URL if set, otherwise the host this request came to. */
function appOrigin(req: any) {
  const set = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (set) return set;
  const proto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0];
  return `${proto}://${String(req.get('x-forwarded-host') || req.get('host')).split(',')[0]}`;
}

/** Routes the patient's browser calls with no sign-in. The unguessable consult token in the link is the credential. */
export function videoPublicRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const R = () => ctx.repos;

  const open = async (token: string) => {
    const c = await R().videoConsults.byToken(String(token));
    if (!c) return { status: 404, error: 'This video link is not valid.' } as const;
    if (c.endedAt) return { status: 410, error: 'This consultation has ended.' } as const;
    if (Date.parse(c.expiresAt) < Date.now()) return { status: 410, error: 'This video link has expired. Ask your doctor for a new one.' } as const;
    return { consult: c } as const;
  };

  router.get('/video/public/:token', async (req, res) => {
    const r = await open(req.params.token);
    if ('error' in r) return res.status(r.status).json({ error: r.error });
    // Only what the patient needs to recognise the call: the doctor's name and their own first name.
    res.json({ doctorName: r.consult.doctorName, patientFirstName: String(r.consult.patientName || '').split(' ')[0], expiresAt: r.consult.expiresAt });
  });

  router.post('/video/public/:token/signal', async (req, res) => {
    const r = await open(req.params.token);
    if ('error' in r) return res.status(r.status).json({ error: r.error });
    const { role, key, type, data } = req.body || {};
    if (role !== 'doctor' && role !== 'patient') return res.status(400).json({ error: 'role must be doctor or patient' });
    if (role === 'doctor' && !sameSecret(key, r.consult.doctorKey)) return res.status(403).json({ error: 'Not allowed' });
    if (!(SIGNAL_TYPES as readonly string[]).includes(type)) return res.status(400).json({ error: 'Unknown signal type' });
    const payload = JSON.stringify(data ?? null);
    if (payload.length > MAX_SIGNAL_BYTES) return res.status(413).json({ error: 'Signal too large' });
    if ((await R().videoSignals.count(r.consult.id)) >= MAX_SIGNALS_PER_CONSULT) return res.status(429).json({ error: 'Too many signals for this call' });
    await R().videoSignals.insert({ id: id('sig'), consultId: r.consult.id, from: role, type, data: payload, at: Date.now() });
    res.status(201).json({ ok: true });
  });

  router.get('/video/public/:token/signals', async (req, res) => {
    const r = await open(req.params.token);
    if ('error' in r) return res.status(r.status).json({ error: r.error });
    const role = String(req.query.role);
    if (role !== 'doctor' && role !== 'patient') return res.status(400).json({ error: 'role must be doctor or patient' });
    if (role === 'doctor' && !sameSecret(req.query.key, r.consult.doctorKey)) return res.status(403).json({ error: 'Not allowed' });
    const rows = await R().videoSignals.forReader(r.consult.id, role, Number(req.query.since) || 0);
    res.json({ signals: rows.map((s: any) => ({ id: s.id, at: s.at, type: s.type, data: JSON.parse(s.data) })), now: Date.now() });
  });

  return router;
}

/** Routes for the signed-in doctor: start a consult, send the link on WhatsApp, end it. */
export function videoStaffRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;
  const R = () => ctx.repos;

  const own = async (req: any, res: any) => {
    const c = await R().videoConsults.byToken(String(req.params.id));
    if (!c || c.doctorId !== req.user.id) { res.status(404).json({ error: 'Consultation not found' }); return null; }
    return c;
  };

  router.post('/video/consults', roles('doctor'), async (req: any, res) => {
    const p = await R().patients.byRef(String(req.body?.patientId || ''));
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    if (!(await linkedPatientIds(R(), req.user.id)).has(p.id)) {
      await audit(req, 'denied', 'patient', p.id, 'Doctor is not linked to this patient (video consult)');
      return res.status(403).json({ error: 'This patient is not linked to you' });
    }
    const consult = {
      id: random(18), doctorKey: random(18), patientId: p.id, patientName: p.name, doctorId: req.user.id, doctorName: req.user.name,
      createdAt: now(), expiresAt: new Date(Date.now() + CONSULT_MINUTES * 60_000).toISOString()
    };
    await R().videoConsults.insert(consult);
    await audit(req, 'create', 'videoConsult', consult.id.slice(0, 8), `Started a video consult with ${p.patientId}`);
    res.status(201).json({ id: consult.id, doctorKey: consult.doctorKey, expiresAt: consult.expiresAt, patientName: p.name, hasPhone: Boolean(p.phone) });
  });

  router.post('/video/consults/:id/send', roles('doctor'), async (req: any, res) => {
    const c = await own(req, res);
    if (!c) return;
    const p = await R().patients.byRef(c.patientId);
    if (!p?.phone) return res.status(400).json({ error: 'This patient has no phone number on file' });
    const link = `${appOrigin(req)}/consult/${c.id}`;
    const out = await sendWhatsAppText(p.phone, `📹 CareWeave: ${c.doctorName} is ready for your video consultation. Open this link on your phone (allow camera and microphone): ${link}\nThe link works for about 2 hours.`);
    await audit(req, 'update', 'videoConsult', c.id.slice(0, 8), out.ok ? 'Link sent on WhatsApp' : `Link not sent: ${out.error}`);
    res.status(out.ok ? 200 : 502).json({ sent: out.ok, via: out.via, error: out.error, link });
  });

  router.post('/video/consults/:id/end', roles('doctor'), async (req: any, res) => {
    const c = await own(req, res);
    if (!c) return;
    if (!c.endedAt) {
      await R().videoConsults.update(c, { endedAt: now() });
      await R().videoSignals.insert({ id: id('sig'), consultId: c.id, from: 'doctor', type: 'bye', data: 'null', at: Date.now() });
      await audit(req, 'update', 'videoConsult', c.id.slice(0, 8), 'Video consult ended');
    }
    res.json({ ok: true });
  });

  return router;
}
