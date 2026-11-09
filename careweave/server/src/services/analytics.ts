import type { Repos } from '../repo/index.js';
import { ConflictError, DuplicateError } from '../repo/index.js';
import { syncDataToExasol, type ExasolPort, type SyncKind, type SyncResult, type SyncSource } from '../exasol/sync.js';

const PAGE = 500;
const META_ID = 'exasol-sync';
const LOCK_MS = 10 * 60 * 1000;
const overlapMs = () => (process.env.ANALYTICS_SYNC_OVERLAP_MS === undefined ? 5000 : Number(process.env.ANALYTICS_SYNC_OVERLAP_MS)); // re-read a few seconds before the last start, so a write that landed during it is not missed

/** Walks a collection in id order, a page at a time, so no whole collection is ever held in memory. */
async function* pageThrough(find: (filter: Record<string, any>, opts: { sort: Record<string, 1>; limit: number }) => Promise<any[]>, since?: string) {
  let last = '';
  for (;;) {
    const rows = await find({ ...(since ? { updatedAt: { $gte: since } } : {}), ...(last ? { id: { $gt: last } } : {}) }, { sort: { id: 1 }, limit: PAGE });
    if (!rows.length) return;
    yield rows;
    last = rows[rows.length - 1].id;
    if (rows.length < PAGE) return;
  }
}

export function pagedSource(repos: Repos): SyncSource {
  const finders: Record<SyncKind, Repos['appointments']['find']> = {
    appointments: repos.appointments.find, labOrders: repos.orders.find, prescriptions: repos.prescriptions.find, syntheticHistory: repos.syntheticHistory.find,
  };
  return { pages: (kind, since) => pageThrough((f, o) => finders[kind](f, o), since) };
}

export type SyncOutcome = (SyncResult & { busy?: false }) | { busy: true; success: false; error: string };

/**
 * Runs the Exasol sync under a lock kept in the database (so a button press and a scheduled run, on any instance, never overlap).
 * Incremental when a previous sync succeeded and `full` is not asked for; the watermark moves only after a successful run.
 */
export async function runAnalyticsSync(repos: Repos, opts: { full?: boolean; port?: ExasolPort } = {}): Promise<SyncOutcome> {
  const busy = { busy: true as const, success: false as const, error: 'A sync is already running. Try again in a minute.' };
  const startedAt = new Date();
  let meta = await repos.meta.byId(META_ID);
  if (meta?.lockedUntil && meta.lockedUntil > startedAt.toISOString()) return busy;
  try {
    const lock = { lockedUntil: new Date(startedAt.getTime() + LOCK_MS).toISOString() };
    meta = meta ? await repos.meta.update(meta, lock) : await repos.meta.insert({ id: META_ID, ...lock });
  } catch (err) {
    if (err instanceof ConflictError || err instanceof DuplicateError) return busy; // someone else took the lock first
    throw err;
  }
  let result: SyncResult | null = null;
  try {
    const since = !opts.full && meta.watermark ? new Date(Date.parse(meta.watermark) - overlapMs()).toISOString() : undefined;
    result = await syncDataToExasol(pagedSource(repos), { since, port: opts.port });
    return result;
  } finally {
    const done: Record<string, any> = { lockedUntil: undefined };
    if (result?.success) Object.assign(done, { watermark: startedAt.toISOString(), lastSyncAt: new Date().toISOString(), lastMode: result.mode, lastRows: result.syncedVisits + result.syncedLabOrders + result.syncedPrescriptions });
    await repos.meta.update(meta, done).catch((e: any) => console.error('Could not record the sync result:', e?.message));
  }
}

export const syncStatus = async (repos: Repos) => {
  const m = await repos.meta.byId(META_ID);
  return { lastSyncAt: m?.lastSyncAt ?? null, lastMode: m?.lastMode ?? null, lastRows: m?.lastRows ?? null, running: !!(m?.lockedUntil && m.lockedUntil > new Date().toISOString()) };
};

/**
 * What the overview computes over when Exasol is offline: the last ANALYTICS_WINDOW_DAYS days (default 90) of visits, lab orders and
 * prescriptions, the synthetic sample history, and the blocked-prescription audit entries. Totals come from counts, not from loading
 * the collections. Exasol itself holds all history.
 */
export const windowDays = () => Number(process.env.ANALYTICS_WINDOW_DAYS) || 90;
export async function overviewSnapshot(repos: Repos, days = windowDays()) {
  const cutoffAt = new Date(Date.now() - days * 86_400_000).toISOString();
  const cutoffDay = cutoffAt.slice(0, 10);
  const [appointments, labOrders, prescriptions, syntheticHistory, auditLogs, patients, nApps, nOrders, nRx] = await Promise.all([
    repos.appointments.find({ date: { $gte: cutoffDay } }),
    repos.orders.find({ orderedAt: { $gte: cutoffAt } }),
    repos.prescriptions.find({ date: { $gte: cutoffAt } }),
    repos.syntheticHistory.find(),
    repos.audit.find({ action: 'blocked', timestamp: { $gte: cutoffAt } }),
    repos.patients.count(), repos.appointments.count(), repos.orders.count(), repos.prescriptions.count(),
  ]);
  return { patients: [], appointments, labOrders, prescriptions, syntheticHistory, auditLogs, counts: { patients, appointments: nApps, labOrders: nOrders, prescriptions: nRx }, windowDays: days };
}

/** After records are removed from the source (the sample history), the next sync must be a full one so Exasol drops their rows too. */
export async function forceFullNextSync(repos: Repos) {
  const m = await repos.meta.byId(META_ID);
  if (m?.watermark) await repos.meta.update(m, { watermark: undefined }).catch(() => {});
}
