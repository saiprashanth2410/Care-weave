import { asError } from '../errors.js';
/** Sends WhatsApp text messages straight through Meta's WhatsApp Cloud API (no n8n in between). */

const TIMEOUT_MS = 4000;
const API_VERSION = 'v20.0';

export type MetaResult = { ok: boolean; skipped?: boolean; error?: string };

export const metaConfigured = () => Boolean(process.env.META_WHATSAPP_TOKEN && process.env.META_PHONE_NUMBER_ID);

/** Meta wants the number as digits with the country code and no "+". A bare 10-digit number gets DEFAULT_COUNTRY_CODE (91). */
export function metaNumber(phone: unknown): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `${process.env.DEFAULT_COUNTRY_CODE || '91'}${digits}` : digits;
}

/** Meta's error codes that staff can actually act on. Anything else is shown with Meta's own message. */
const HINTS: Record<number, string> = {
  190: 'the access token expired or is wrong: make a new one in Meta and update META_WHATSAPP_TOKEN',
  131030: 'this number is not on the allowed recipient list: add it under API Setup > "To" in the Meta app',
  131047: 'more than 24 hours since this number last messaged the business: ask it to send any message (for example "hi") to the business number first',
  131026: 'the number is not on WhatsApp',
  132000: 'a template parameter is missing',
};

export async function sendViaMeta(phone: unknown, text: string): Promise<MetaResult> {
  const token = process.env.META_WHATSAPP_TOKEN, phoneId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, skipped: true };
  const to = metaNumber(phone);
  if (!to || !text) return { ok: false, skipped: true };
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.ok) return { ok: true };
    const body: any = await res.json().catch(() => ({}));
    const code = Number(body?.error?.code);
    const error = `${HINTS[code] || body?.error?.message || `HTTP ${res.status}`} (code ${Number.isFinite(code) ? code : res.status})`;
    console.warn(`Meta WhatsApp send failed: ${error}`);
    return { ok: false, error };
  } catch (err) {
    const error = asError(err).name === 'TimeoutError' ? 'Meta did not answer in time' : asError(err).message || 'network error';
    console.warn(`Meta WhatsApp send failed: ${error}`);
    return { ok: false, error };
  }
}
