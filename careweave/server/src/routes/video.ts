import crypto from 'node:crypto';
import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { linkedPatientIds } from '../services/access.js';
import { MAX_SIGNALS_PER_CONSULT, SIGNAL_TYPES } from '../repo/videoConsults.js';
import { sendWhatsAppText } from '../whatsapp/emitter.js';
import { parseImageDataUrl } from '../services/imageData.js';
import { ask, MODELS } from '../clinicalSummary.js';
import { readAiConfig } from '../services/aiConfig.js';
import { id, now } from '../util.js';

const CONSULT_MINUTES = 120;
const MAX_SIGNAL_BYTES = 24_000; // a session description is about 5 to 10 KB
const MAX_TEXT = 1000; // one chat message or caption line
const MAX_PHOTO_SIGNAL_BYTES = 640_000; // a chat message that carries one photo
const MAX_PHOTOS_PER_CONSULT = 15;
const MAX_TRANSCRIPT_CHARS = 12_000;
const SUMMARY_PROMPT = `You are helping a doctor write notes after a video consultation. Below is the transcript: typed chat and speech-to-text, in English, Tamil or Hindi, and it may contain recognition mistakes.
Write a short clinical summary in plain text with these headings, one or two lines each: Reason for consultation; Symptoms and history reported; Advice and plan from the doctor; Medicines mentioned; Follow-up.
Rules: use only what is in the transcript, never invent a symptom, dose or diagnosis, write "not discussed" for a heading with nothing, and say "unclear" where the transcript is unclear. Under 180 words.\n\nTRANSCRIPT\n`;
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
    let hasImage = false;
    if (type === 'chat' || type === 'caption') {
      const t = typeof data?.text === 'string' ? data.text.trim() : '';
      if (t.length > MAX_TEXT) return res.status(413).json({ error: 'Message too long' });
      if (type === 'chat' && data?.image !== undefined && data?.image !== null) {
        const parsed = parseImageDataUrl(data.image);
        if (!parsed.ok) return res.status(400).json({ error: parsed.error });
        hasImage = true;
      }
      if (!t && !hasImage) return res.status(400).json({ error: 'text is required' });
    }
    const payload = JSON.stringify(data ?? null);
    if (payload.length > (hasImage ? MAX_PHOTO_SIGNAL_BYTES : MAX_SIGNAL_BYTES)) return res.status(413).json({ error: 'Signal too large' });
    if (hasImage && (await R().videoSignals.photoCount(r.consult.id)) >= MAX_PHOTOS_PER_CONSULT) return res.status(429).json({ error: 'Too many photos in this call' });
    if ((await R().videoSignals.count(r.consult.id)) >= MAX_SIGNALS_PER_CONSULT) return res.status(429).json({ error: 'Too many signals for this call' });
    await R().videoSignals.insert({ id: id('sig'), consultId: r.consult.id, from: role, type, data: payload, at: Date.now(), hasImage });
    res.status(201).json({ ok: true });
  });

  router.get('/video/public/:token/signals', async (req, res) => {
    const r = await open(req.params.token);
    if ('error' in r) return res.status(r.status).json({ error: r.error });
    const role = String(req.query.role);
    if (role !== 'doctor' && role !== 'patient') return res.status(400).json({ error: 'role must be doctor or patient' });
    if (role === 'doctor' && !sameSecret(req.query.key, r.consult.doctorKey)) return res.status(403).json({ error: 'Not allowed' });
    if (role === 'doctor') {
      // A heartbeat for the front desk's "in a video consultation" badge, written at most every 15 seconds.
      const last = Date.parse(r.consult.doctorSeenAt || r.consult.createdAt);
      if (Date.now() - last > 15_000) await R().videoConsults.update(r.consult, { doctorSeenAt: now() }).catch(() => {});
    }
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
    // Either a patient the doctor is linked to, or a walk-in / phone-in person who has no record yet: then only a name and a phone
    // number are taken, nothing about any chart is reachable, and the call has nothing to attach to until the front desk registers them.
    let who: { patientId: string | null; patientName: string; phone: string; note: string };
    if (req.body?.patientId) {
      const p = await R().patients.byRef(String(req.body.patientId));
      if (!p) return res.status(404).json({ error: 'Patient not found' });
      if (!(await linkedPatientIds(R(), req.user.id)).has(p.id)) {
        await audit(req, 'denied', 'patient', p.id, 'Doctor is not linked to this patient (video consult)');
        return res.status(403).json({ error: 'This patient is not linked to you' });
      }
      who = { patientId: p.id, patientName: p.name, phone: p.phone || '', note: `Started a video consult with ${p.patientId}` };
    } else {
      const name = String(req.body?.name ?? '').replace(/\s+/g, ' ').trim();
      const phone = String(req.body?.phone ?? '').trim();
      if (!/^[\p{L}][\p{L}\p{M} .'-]{1,79}$/u.test(name)) return res.status(400).json({ error: "Enter the person's name (letters only, 2 to 80 characters)" });
      if (phone && phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Enter a phone number with at least 10 digits, or leave it empty and share the link yourself' });
      who = { patientId: null, patientName: name, phone, note: 'Started a video consult with a walk-in (no patient record)' };
    }
    const consult = {
      id: random(18), doctorKey: random(18), patientId: who.patientId, patientName: who.patientName, phone: who.phone, doctorId: req.user.id, doctorName: req.user.name,
      createdAt: now(), doctorSeenAt: now(), expiresAt: new Date(Date.now() + CONSULT_MINUTES * 60_000).toISOString()
    };
    await R().videoConsults.insert(consult);
    await audit(req, 'create', 'videoConsult', consult.id.slice(0, 8), who.note);
    res.status(201).json({ id: consult.id, doctorKey: consult.doctorKey, expiresAt: consult.expiresAt, patientName: who.patientName, hasPhone: Boolean(who.phone), walkIn: !who.patientId });
  });

  router.post('/video/consults/:id/send', roles('doctor'), async (req: any, res) => {
    const c = await own(req, res);
    if (!c) return;
    const phone = c.patientId ? (await R().patients.byRef(c.patientId))?.phone : c.phone;
    if (!phone) return res.status(400).json({ error: 'There is no phone number for this person' });
    const link = `${appOrigin(req)}/consult/${c.id}`;
    const out = await sendWhatsAppText(phone, `📹 CareWeave: ${c.doctorName} is ready for your video consultation. Open this link on your phone (allow camera and microphone): ${link}\nThe link works for about 2 hours.`);
    await audit(req, 'update', 'videoConsult', c.id.slice(0, 8), out.ok ? 'Link sent on WhatsApp' : `Link not sent: ${out.error}`);
    res.status(out.ok ? 200 : 502).json({ sent: out.ok, via: out.via, error: out.error, link });
  });

  const transcriptOf = async (consultId: string) => {
    const rows = await R().videoSignals.transcript(consultId);
    return rows.map((r: any) => ({ from: r.from as 'doctor' | 'patient', kind: r.type as 'chat' | 'caption', text: String(JSON.parse(r.data)?.text || '') || (r.hasImage ? '(shared a photo)' : ''), at: r.at as number })).filter((l: any) => l.text);
  };

  router.get('/video/consults/:id/transcript', roles('doctor'), async (req: any, res) => {
    const c = await own(req, res);
    if (!c) return;
    res.json({ lines: await transcriptOf(c.id) });
  });

  // A summary of what was said, written by the AI key the administrator stored. Names are never sent: only "Doctor" and "Patient" lines.
  router.post('/video/consults/:id/summary', roles('doctor'), async (req: any, res) => {
    const c = await own(req, res);
    if (!c) return;
    const lines = await transcriptOf(c.id);
    if (!lines.length) return res.status(400).json({ error: 'Nothing to summarise yet: no chat messages or captions were recorded in this call.' });
    const text = lines.map((l: any) => `${l.from === 'doctor' ? 'Doctor' : 'Patient'}: ${l.text}`).join('\n').slice(-MAX_TRANSCRIPT_CHARS);
    const ai = await readAiConfig(R());
    if (!ai.key || !ai.features.brief) return res.json({ summary: null, reason: 'ai-off', lines });
    for (const model of [ai.model, ...MODELS].filter(Boolean) as string[]) {
      const out = await ask(model, SUMMARY_PROMPT + text, ai.key);
      if (out) {
        await audit(req, 'create', 'videoConsult', c.id.slice(0, 8), 'Consultation summary generated');
        return res.json({ summary: out.slice(0, 3000), model, lines });
      }
    }
    res.json({ summary: null, reason: 'ai-failed', lines });
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
