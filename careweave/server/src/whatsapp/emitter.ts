export type WhatsAppEventType = 'PATIENT_CHECKED_IN' | 'LAB_REPORT_RELEASED' | 'PRESCRIPTION_PRESCRIBED';

export type WhatsAppEvent = { event: WhatsAppEventType; timestamp: string; [key: string]: any };

const WEBHOOK_TIMEOUT_MS = 3000;
const RECENT_LIMIT = 50;
const recent: (WhatsAppEvent & { seq: number })[] = [];
let seq = 0;

const webhookUrl = () => process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/careweave-events';

/** Events emitted since the server started, newest last. The in-browser WhatsApp simulator polls these. */
export function recentEvents(since = 0) {
  return recent.filter((e) => e.seq > since);
}

/**
 * Sends one event to n8n. The caller never waits: the request runs on its own with a 3 second limit, and every
 * failure (n8n offline, slow, refusing) is swallowed, so a clinical action can never fail because of messaging.
 */
export function emitEvent(event: WhatsAppEventType, data: Record<string, any>): void {
  const payload: WhatsAppEvent = { event, timestamp: new Date().toISOString(), ...data };
  recent.push({ ...payload, seq: ++seq });
  if (recent.length > RECENT_LIMIT) recent.shift();
  if (process.env.NODE_ENV === 'test' || process.env.N8N_WEBHOOK_DISABLED === 'true') return;
  Promise.allSettled([
    fetch(webhookUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
    })
  ]).then(([r]) => {
    if (r.status === 'rejected') console.warn(`n8n webhook not reachable (${event}): ${r.reason?.cause?.code || r.reason?.name || 'error'}`);
  });
}
