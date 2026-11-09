import crypto from 'node:crypto';
import type { Response } from 'express';
import type { Repos } from './repo/index.js';

// Server-sent events: one open response per signed-in screen. A change anywhere tells every other screen to reload,
// and a critical lab result reaches the right doctor at once.
//
// Screens are connected to one server process, so an event is also written to the shared `liveEvents` collection. Every
// instance that has screens connected reads that collection every POLL_MS and forwards what other instances wrote. The
// delay between instances is therefore up to about POLL_MS. Without a database to share (no bus) it stays in-process.

type Client = { res: Response; userId: string; role: string };
type LiveEvent = { id: string; at: string; origin: string; type: string; data: unknown; to?: string[] };

export const POLL_MS = 1500;
const KEEP_MS = 2 * 60 * 1000;

export class LiveHub {
  private clients = new Set<Client>();
  private readonly origin = crypto.randomUUID();
  private changeTimer: NodeJS.Timeout | null = null;
  private tail: NodeJS.Timeout | null = null;
  private cursor = '';
  private seen = new Set<string>();

  /** `bus` returns the repos to share events through, or null while the database is not ready. */
  constructor(private bus: () => Repos | null = () => null, private pollMs = POLL_MS) {}

  addClient(res: Response, userId: string, role: string) {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    const c: Client = { res, userId, role };
    this.clients.add(c);
    this.startTail();
    const beat = setInterval(() => res.write(': ping\n\n'), 25_000);
    res.on('close', () => { clearInterval(beat); this.clients.delete(c); if (!this.clients.size) this.stopTail(); });
  }

  private send(c: Client, type: string, data: unknown) {
    try { c.res.write(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`); } catch { this.clients.delete(c); }
  }

  /** Delivers to the screens connected to this instance only. */
  broadcast(type: string, data?: unknown, only?: (userId: string, role: string) => boolean) {
    for (const c of this.clients) if (!only || only(c.userId, c.role)) this.send(c, type, data);
  }

  /** Delivers here and to every other instance. `to` limits it to those user ids. */
  async publish(type: string, data?: unknown, to?: string[]) {
    this.broadcast(type, data, to && ((id) => to.includes(id)));
    const repos = this.bus();
    if (!repos) return;
    try {
      const now = new Date();
      await repos.liveEvents.insert({ id: crypto.randomUUID(), at: now.toISOString(), origin: this.origin, type, data: data ?? {}, ...(to ? { to } : {}), expireAt: new Date(now.getTime() + KEEP_MS) });
    } catch (err: any) {
      console.warn('Could not share a live event with other instances:', err?.message); // this instance's own screens already got it
    }
  }

  /** Many saves in a burst become one "change" message. */
  announceChange() {
    if (this.changeTimer) return;
    this.changeTimer = setTimeout(() => { this.changeTimer = null; void this.publish('change'); }, 200);
  }

  get connectedCount() { return this.clients.size; }

  private async startTail() {
    if (this.tail) return;
    this.tail = setInterval(() => void this.poll(), this.pollMs);
    this.tail.unref?.();
    const repos = this.bus();
    // Start from the newest event already stored, not from this instance's clock, so clock differences cannot hide an event.
    const newest = await repos?.liveEvents.newest().catch(() => null);
    if (newest) this.seen.add(newest.id); // the query is inclusive of the cursor, so the event it came from must not be replayed
    this.cursor = newest?.at ?? new Date(Date.now() - 5000).toISOString();
  }

  private stopTail() {
    if (this.tail) clearInterval(this.tail);
    this.tail = null;
  }

  /** One read of the shared collection; exposed for tests. */
  async poll() {
    const repos = this.bus();
    if (!repos || !this.cursor || !this.clients.size) return;
    let events: LiveEvent[];
    try { events = await repos.liveEvents.since(this.cursor); } catch (err: any) { console.warn('Could not read live events:', err?.message); return; }
    for (const e of events) {
      if (this.seen.has(e.id)) continue;
      this.seen.add(e.id);
      if (e.at > this.cursor) this.cursor = e.at;
      if (e.origin !== this.origin) this.broadcast(e.type, e.data, e.to && ((id) => e.to!.includes(id)));
    }
    if (this.seen.size > 1000) this.seen = new Set([...this.seen].slice(-500));
  }
}
