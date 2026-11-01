import { eventText } from './messages.js';
const WEBHOOK_TIMEOUT_MS = 3000;
const RECENT_LIMIT = 50;
const recent = [];
let seq = 0;
const webhookUrl = () => process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/careweave-events';
async function sendViaTwilio(e) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM || '+14155238886';
    const phone = e.phone;
    if (!sid || !token || !phone)
        return;
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10)
        return;
    const to = digits.length === 10 ? `+91${digits}` : `+${digits}`;
    const fromFormatted = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
    const text = eventText(e);
    if (!text)
        return;
    const params = new URLSearchParams({
        To: `whatsapp:${to}`,
        From: fromFormatted,
        Body: text
    });
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString(),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
    }).catch((err) => {
        console.warn(`Twilio WhatsApp dispatch failed: ${err?.message || err}`);
    });
}
/** Events emitted since the server started, newest last. The in-browser WhatsApp simulator polls these. */
export function recentEvents(since = 0) {
    return recent.filter((e) => e.seq > since);
}
/**
 * Sends one event to n8n (and Twilio if configured). The caller never waits: the request runs on its own with a 3 second limit, and every
 * failure (n8n offline, slow, refusing) is swallowed, so a clinical action can never fail because of messaging.
 */
export function emitEvent(event, data) {
    const payload = { event, timestamp: new Date().toISOString(), ...data };
    recent.push({ ...payload, seq: ++seq });
    if (recent.length > RECENT_LIMIT)
        recent.shift();
    if (process.env.NODE_ENV === 'test' || process.env.N8N_WEBHOOK_DISABLED === 'true')
        return;
    // Direct Twilio fallback so alerts work even without running local n8n instance
    if (payload.phone) {
        sendViaTwilio(payload).catch(() => { });
    }
    Promise.allSettled([
        fetch(webhookUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
        })
    ]).then(([r]) => {
        if (r.status === 'rejected')
            console.warn(`n8n webhook not reachable (${event}): ${r.reason?.cause?.code || r.reason?.name || 'error'}`);
    });
}
