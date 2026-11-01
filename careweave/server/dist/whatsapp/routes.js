import crypto from 'node:crypto';
import express, { Router } from 'express';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { recentEvents } from './emitter.js';
import { activePrescriptions, eventText, latestReport, queueStatus, replyTo } from './messages.js';
import { uhidFromBody, whatsappView } from '../services/whatsappData.js';
// n8n and the WhatsApp providers are not signed-in staff, so they present a shared key (header or ?key=).
// With no key configured the endpoints stay open for local demos only; production refuses them.
function keyGuard(req, res, next) {
    const want = process.env.WHATSAPP_API_KEY;
    if (!want) {
        if (process.env.NODE_ENV === 'production')
            return res.status(503).json({ error: 'Set WHATSAPP_API_KEY to enable the WhatsApp endpoints' });
        return next();
    }
    const got = Buffer.from(String(req.get('x-api-key') || req.query.key || ''));
    const exp = Buffer.from(want);
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp))
        return res.status(401).json({ error: 'Invalid key' });
    next();
}
/** True when `header` is Meta's `sha256=` + HMAC-SHA256 of the exact bytes received, keyed with the app secret. */
export function validMetaSignature(raw, header, secret) {
    if (!header || !header.startsWith('sha256='))
        return false;
    const got = Buffer.from(header.slice('sha256='.length), 'hex');
    const want = crypto.createHmac('sha256', secret).update(raw).digest();
    return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function sendViaMeta(to, text) {
    const token = process.env.META_WHATSAPP_TOKEN, phoneId = process.env.META_PHONE_NUMBER_ID;
    if (!token || !phoneId)
        return;
    await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
        signal: AbortSignal.timeout(3000)
    }).catch(() => { });
}
/** Reads the raw bytes of a webhook body as JSON or as a form post. A body that cannot be read is `null`. */
function parseBody(raw, contentType) {
    const s = raw.toString('utf8');
    if (!s)
        return {};
    try {
        if (contentType.includes('application/x-www-form-urlencoded'))
            return Object.fromEntries(new URLSearchParams(s));
        return JSON.parse(s);
    }
    catch {
        return null;
    }
}
/**
 * Routes for n8n and the WhatsApp providers. Mount BEFORE the JSON body parser and the staff auth middleware: the inbound
 * webhook needs the exact bytes Meta signed, so it reads its own raw body.
 */
export function whatsappPublicRoutes({ repos }) {
    const router = Router();
    catchAsyncRoutes(router);
    const q = (req) => ({ phone: String(req.query.phone || ''), uhid: String(req.query.uhid || '') });
    const need = (req, res) => {
        if (!q(req).phone && !q(req).uhid) {
            res.status(400).json({ error: 'phone or uhid is required' });
            return false;
        }
        return true;
    };
    router.get('/api/whatsapp/queue-status', keyGuard, async (req, res) => need(req, res) && res.json(queueStatus(await whatsappView(repos(), q(req)), q(req))));
    router.get('/api/whatsapp/latest-report', keyGuard, async (req, res) => need(req, res) && res.json(latestReport(await whatsappView(repos(), q(req)), q(req))));
    router.get('/api/whatsapp/active-prescriptions', keyGuard, async (req, res) => need(req, res) && res.json(activePrescriptions(await whatsappView(repos(), q(req)), q(req))));
    // Meta checks the webhook URL once with this handshake.
    router.get('/api/whatsapp/inbound', (req, res) => {
        const verify = process.env.META_VERIFY_TOKEN;
        if (verify && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verify)
            return res.status(200).send(String(req.query['hub.challenge'] || ''));
        res.sendStatus(403);
    });
    // Standalone two-way fallback: Twilio (form post), Meta (signed JSON) or n8n (JSON with the shared key) call this.
    // A request that looks like Meta's is accepted only with a valid X-Hub-Signature-256; everything else needs the shared key.
    router.post('/api/whatsapp/inbound', express.raw({ type: () => true, limit: '1mb' }), async (req, res, next) => {
        const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const b = parseBody(raw, String(req.get('content-type') || ''));
        if (!b)
            return res.status(400).json({ error: 'Request body could not be read' });
        const signature = req.get('x-hub-signature-256');
        const looksLikeMeta = signature !== undefined || b.object === 'whatsapp_business_account' || Array.isArray(b.entry);
        if (!looksLikeMeta) {
            req.body = b;
            return keyGuard(req, res, async () => {
                const from = String(b.From || b.from || '').replace(/^whatsapp:/, '');
                const body = String(b.Body ?? b.body ?? b.message ?? '');
                const out = replyTo(await whatsappView(repos(), { phone: from, uhid: uhidFromBody(body) }), from, body);
                if (b.From)
                    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(out.reply)}</Message></Response>`);
                res.json(out);
            });
        }
        const secret = process.env.META_APP_SECRET;
        if (!secret) {
            if (process.env.NODE_ENV === 'production') {
                console.error('Refusing a Meta WhatsApp webhook call: META_APP_SECRET is not set, so its signature cannot be verified.');
                return res.status(503).json({ error: 'Webhook signature verification is not configured' });
            }
            console.warn('META_APP_SECRET is not set: accepting an unsigned Meta webhook call because this is not production.');
        }
        else if (!validMetaSignature(raw, signature, secret)) {
            return res.status(401).json({ error: 'Invalid or missing webhook signature' });
        }
        const meta = b.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (meta) {
            const body = meta.text?.body || '';
            const out = replyTo(await whatsappView(repos(), { phone: meta.from, uhid: uhidFromBody(body) }), meta.from, body);
            await sendViaMeta(meta.from, out.reply);
        }
        res.sendStatus(200); // delivery receipts and other notifications carry no message and need no reply
    });
    return router;
}
/** Simulator endpoints for signed-in staff. Mount AFTER the staff auth middleware. */
export function whatsappSimulatorRoutes({ repos }) {
    const router = Router();
    catchAsyncRoutes(router);
    router.get('/whatsapp/simulator/patients', async (_req, res) => res.json((await repos().patients.find({}, { sort: { createdAt: -1 }, limit: 50 })).map((p) => ({ name: p.name, uhid: p.patientId, phone: p.phone }))));
    router.post('/whatsapp/simulate', async (req, res) => {
        const phone = String(req.body?.phone || '');
        if (!phone)
            return res.status(400).json({ error: 'phone is required' });
        const message = String(req.body?.message || '');
        res.json(replyTo(await whatsappView(repos(), { phone, uhid: uhidFromBody(message) }), phone, message));
    });
    router.get('/whatsapp/simulator/events', (req, res) => res.json(recentEvents(Number(req.query.since) || 0).map((e) => ({ seq: e.seq, event: e.event, phone: e.phone, text: eventText(e), at: e.timestamp }))));
    return router;
}
