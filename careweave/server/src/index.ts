import { SERVER_DIR } from './env.js';
import path from 'node:path';
import { LiveHub } from './liveEvents.js';
import { importMedicines } from './medicines.js';
import { buildSeed } from './seed.js';
import { INDEXES, LocalStore, QUIET, createRepos, openMongoStore, type Repos, type Store } from './repo/index.js';
import { createApp } from './app.js';
import { ensureStaff } from './services/staff.js';
import { readStartupStamp, startupStamp, writeStartupStamp } from './services/startup.js';
import { backfillAppointmentKeys } from './services/backfill.js';
import { runAnalyticsSync } from './services/analytics.js';
import { isExasolConfigured } from './exasol/client.js';
import { asError } from './errors.js';

const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 4000);
const DATA = path.join(SERVER_DIR, 'data/careweave.json');

/** MongoDB when MONGODB_URI is set. The JSON file only when it is not, and never in production unless ALLOW_LOCAL_STORE=true. */
async function openStore(): Promise<Store> {
  const onChange = (name: string) => { if (!QUIET.has(name)) live.announceChange(); };
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (uri) {
    try {
      const store = await openMongoStore(uri, process.env.MONGODB_DB || 'careweave', onChange);
      console.log('[storage] MongoDB: every read and write goes to the database. No data is cached in this process.');
      return store;
    } catch (err) {
      // Not falling back to local files: on a serverless host that would give every instance its own private data.
      throw new Error(`MongoDB connection failed: ${(asError(err).message || '').replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]')}`);
    }
  }
  if ((isProd || isVercel) && process.env.ALLOW_LOCAL_STORE !== 'true') {
    throw new Error('MONGODB_URI is not set. Production needs MongoDB; the local JSON file is for development only (ALLOW_LOCAL_STORE=true overrides, for a single instance).');
  }
  const store = new LocalStore(DATA, onChange, path.join(SERVER_DIR, 'uploads/store'));
  await store.load(async () => ({ ...(await buildSeed()) }));
  console.warn(`[storage] LOCAL JSON FILE (${DATA}): development fallback because MONGODB_URI is not set. Single process only; not for production.`);
  return store;
}

let current: Repos | null = null;
const live = new LiveHub(() => current);
const repos = () => {
  if (!current) throw new Error('The database is not ready yet');
  return current;
};

export const app = createApp({ repos, live });

let initPromise: Promise<void> | null = null;
export function ensureInitialized() {
  initPromise ??= (async () => {
    const t0 = Date.now();
    const store = await openStore();
    const connected = Date.now();
    current = createRepos(store);
    const stamp = await startupStamp();
    // The local JSON store has nothing to remember between runs, so it always sets up; MongoDB skips the work when the stamp matches.
    const done = store.mode === 'mongo' ? await readStartupStamp(current).catch(() => undefined) : undefined;
    const checked = Date.now();
    let ran = false;
    if (done !== stamp) {
      ran = true;
      const failedIndexes = (await store.ensureIndexes(INDEXES)) || 0;
      if (store.mode === 'mongo') importMedicines().catch((err) => console.warn('Medicine import failed:', err?.message));
      await ensureStaff(current);
      await backfillAppointmentKeys(current).catch((err) => console.warn('Appointment key backfill failed:', err?.message));
      // Not stamped while an index is missing, so the next start tries again.
      if (store.mode === 'mongo' && !failedIndexes) await writeStartupStamp(current, stamp).catch((err) => console.warn('Could not save the start-up stamp:', err?.message));
    }
    console.log(`[startup] connect ${connected - t0} ms, check ${checked - connected} ms, set-up ${ran ? `ran ${Date.now() - checked} ms` : 'skipped (already done)'}`);
  })().catch((err) => { initPromise = null; throw err; });
  return initPromise;
}

export default app;

/** ANALYTICS_SYNC_MINUTES=15 runs the incremental Exasol sync on that interval (not on Vercel; use the cron route there). */
function startScheduledSync() {
  const minutes = Number(process.env.ANALYTICS_SYNC_MINUTES);
  if (!minutes || minutes < 1 || !isExasolConfigured()) return;
  setInterval(() => {
    runAnalyticsSync(current!).then((r) => { if (!r.success && !r.busy) console.warn('[analytics] scheduled sync failed:', r.error); })
      .catch((e) => console.warn('[analytics] scheduled sync error:', e?.message));
  }, minutes * 60_000).unref();
  console.log(`[analytics] incremental Exasol sync every ${minutes} min`);
}

if (!isVercel) {
  ensureInitialized().then(() => {
    startScheduledSync();
    app.listen(PORT, () => console.log(`CareWeave API listening on http://localhost:${PORT} [storage: ${current!.mode}]`));
  }).catch((err) => {
    console.error('Failed to start CareWeave API:', err.message);
    process.exitCode = 1;
  });
}
