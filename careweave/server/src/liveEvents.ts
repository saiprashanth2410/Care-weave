import type { Response } from 'express';

// Server-sent events: one open response per signed-in screen. A change anywhere tells every other screen to reload,
// and a critical lab result reaches the right doctor at once. State lives in this process, so with several server
// instances only the screens connected to the instance that handled the change hear about it (clients keep polling
// as a safety net).

type Client = { res: Response; userId: string; role: string };
const clients = new Set<Client>();

export function addClient(res: Response, userId: string, role: string) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  const c: Client = { res, userId, role };
  clients.add(c);
  const beat = setInterval(() => res.write(': ping\n\n'), 25_000);
  res.on('close', () => { clearInterval(beat); clients.delete(c); });
}

const send = (c: Client, type: string, data: unknown) => {
  try { c.res.write(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`); } catch { clients.delete(c); }
};

export function broadcast(type: string, data?: unknown, only?: (userId: string, role: string) => boolean) {
  for (const c of clients) if (!only || only(c.userId, c.role)) send(c, type, data);
}

let timer: NodeJS.Timeout | null = null;
/** Many saves in a burst become one "change" message. */
export function announceChange() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; broadcast('change'); }, 200);
}

export const connectedCount = () => clients.size;
