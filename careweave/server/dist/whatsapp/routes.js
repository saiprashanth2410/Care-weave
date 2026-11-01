import crypto from 'node:crypto';
import express from 'express';
import { recentEvents } from './emitter.js';
import { activePrescriptions, eventText, latestReport, queueStatus, replyTo } from './messages.js';
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
/** Routes for n8n and the WhatsApp providers. Mount BEFORE the staff auth middleware. */
export function registerWhatsAppRoutes({ app, db }) {
    const q = (req) => ({ phone: String(req.query.phone || ''), uhid: String(req.query.uhid || '') });
    const need = (req, res) => {
        if (!q(req).phone && !q(req).uhid) {
            res.status(400).json({ error: 'phone or uhid is required' });
            return false;
        }
        return true;
    };
    app.get('/api/whatsapp/queue-status', keyGuard, (req, res) => need(req, res) && res.json(queueStatus(db(), q(req))));
    app.get('/api/whatsapp/latest-report', keyGuard, (req, res) => need(req, res) && res.json(latestReport(db(), q(req))));
    app.get('/api/whatsapp/active-prescriptions', keyGuard, (req, res) => need(req, res) && res.json(activePrescriptions(db(), q(req))));
    // Meta checks the webhook URL once with this handshake.
    app.get('/api/whatsapp/inbound', (req, res) => {
        const verify = process.env.META_VERIFY_TOKEN;
        if (verify && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verify)
            return res.status(200).send(String(req.query['hub.challenge'] || ''));
        res.sendStatus(403);
    });
    // Standalone two-way fallback: Twilio (form post) or Meta (JSON) calls this when n8n is not in the loop.
    app.post('/api/whatsapp/inbound', keyGuard, express.urlencoded({ extended: false }), async (req, res) => {
        const b = req.body || {};
        const meta = b.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (meta) {
            const out = replyTo(db(), meta.from, meta.text?.body || '');
            await sendViaMeta(meta.from, out.reply);
            return res.sendStatus(200);
        }
        const from = String(b.From || b.from || '').replace(/^whatsapp:/, '');
        const out = replyTo(db(), from, String(b.Body ?? b.body ?? b.message ?? ''));
        if (b.From)
            return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(out.reply)}</Message></Response>`);
        res.json(out);
    });
}
/** Simulator endpoints for signed-in staff. Mount AFTER the staff auth middleware. */
export function registerWhatsAppSimulator({ app, db }) {
    app.get('/api/whatsapp/simulator/patients', (_req, res) => res.json(db().patients.slice(0, 50).map((p) => ({ name: p.name, uhid: p.patientId, phone: p.phone }))));
    app.post('/api/whatsapp/simulate', (req, res) => {
        const phone = String(req.body?.phone || '');
        if (!phone)
            return res.status(400).json({ error: 'phone is required' });
        res.json(replyTo(db(), phone, String(req.body?.message || '')));
    });
    app.get('/api/whatsapp/simulator/events', (req, res) => res.json(recentEvents(Number(req.query.since) || 0).map((e) => ({ seq: e.seq, event: e.event, phone: e.phone, text: eventText(e), at: e.timestamp }))));
}
