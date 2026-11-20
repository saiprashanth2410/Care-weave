import { eventText } from './messages.js';
import { metaConfigured, sendViaMeta } from './meta.js';

export type WhatsAppEventType = 'PATIENT_CHECKED_IN' | 'LAB_REPORT_RELEASED' | 'PRESCRIPTION_PRESCRIBED';

export type WhatsAppEvent = { event: WhatsAppEventType; timestamp: string; [key: string]: any };

const WEBHOOK_TIMEOUT_MS = 3000;
const RECENT_LIMIT = 50;
const recent: (WhatsAppEvent & { seq: number })[] = [];
let seq = 0;

const webhookUrl = () => process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/careweave-events';

async function sendViaTwilio(e: WhatsAppEvent) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM || '+14155238886';
  const phone = e.phone;
  if (!sid || !token || !phone) return;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return;
  const to = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  const fromFormatted = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const text = eventText(e);
  if (!text) return;

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
 * Sends one event to the patient's WhatsApp and to n8n. It never throws and each send has its own short time limit, so a clinical action can
 * never fail because of messaging. Callers `await` it: on a serverless host (Vercel) the function is frozen as soon as the response is sent,
 * so a send that is not awaited can be lost.
 *
 * How the message is sent, first match wins:
 *  1. Meta WhatsApp Cloud API directly, when META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID are set and N8N_WEBHOOK_URL is NOT set
 *     (with n8n configured, n8n sends it, so the patient does not get two copies).
 *  2. Twilio directly, when its credentials are set.
 *  The event is also posted to n8n (default http://localhost:5678/webhook/careweave-events) unless N8N_WEBHOOK_DISABLED=true.
 */
export async function emitEvent(event: WhatsAppEventType, data: Record<string, any>): Promise<void> {
  const payload: WhatsAppEvent = { event, timestamp: new Date().toISOString(), ...data };
  recent.push({ ...payload, seq: ++seq });
  if (recent.length > RECENT_LIMIT) recent.shift();
  if (process.env.NODE_ENV === 'test' || process.env.N8N_WEBHOOK_DISABLED === 'true') return;

  const jobs: Promise<unknown>[] = [];
  if (payload.phone) {
    if (metaConfigured() && !process.env.N8N_WEBHOOK_URL) jobs.push(sendViaMeta(payload.phone, eventText(payload)));
    else jobs.push(sendViaTwilio(payload));
  }
  // An n8n that is not running (always the case on Vercel) refuses at once, so this does not slow the request down.
  jobs.push(
    fetch(webhookUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
    }).catch((r) => console.warn(`n8n webhook not reachable (${event}): ${r?.cause?.code || r?.name || 'error'}`))
  );
  await Promise.allSettled(jobs);
}
