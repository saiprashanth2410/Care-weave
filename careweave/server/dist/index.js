import { SERVER_DIR } from './env.js';
import path from 'node:path';
import { announceChange } from './liveEvents.js';
import { importMedicines } from './medicines.js';
import { buildSeed } from './seed.js';
import { INDEXES, LocalStore, QUIET, createRepos, openMongoStore } from './repo/index.js';
import { createApp } from './app.js';
import { ensureStaff } from './services/staff.js';
const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 4000);
const DATA = path.join(SERVER_DIR, 'data/careweave.json');
/** MongoDB when MONGODB_URI is set. The JSON file only when it is not, and never in production unless ALLOW_LOCAL_STORE=true. */
async function openStore() {
    const onChange = (name) => { if (!QUIET.has(name))
        announceChange(); };
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (uri) {
        try {
            const store = await openMongoStore(uri, process.env.MONGODB_DB || 'careweave', onChange);
            await store.ensureIndexes(INDEXES);
            console.log('[storage] MongoDB: every read and write goes to the database. No data is cached in this process.');
            return store;
        }
        catch (err) {
            // Not falling back to local files: on a serverless host that would give every instance its own private data.
            throw new Error(`MongoDB connection failed: ${(err.message || '').replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]')}`);
        }
    }
    if ((isProd || isVercel) && process.env.ALLOW_LOCAL_STORE !== 'true') {
        throw new Error('MONGODB_URI is not set. Production needs MongoDB; the local JSON file is for development only (ALLOW_LOCAL_STORE=true overrides, for a single instance).');
    }
    const store = new LocalStore(DATA, onChange);
    await store.load(async () => ({ ...(await buildSeed()) }));
    console.warn(`[storage] LOCAL JSON FILE (${DATA}): development fallback because MONGODB_URI is not set. Single process only; not for production.`);
    return store;
}
let current = null;
const repos = () => {
    if (!current)
        throw new Error('The database is not ready yet');
    return current;
};
export const app = createApp({ repos });
let initPromise = null;
export function ensureInitialized() {
    initPromise ??= (async () => {
        const store = await openStore();
        current = createRepos(store);
        if (store.mode === 'mongo')
            importMedicines().catch((err) => console.warn('Medicine import failed:', err?.message));
        await ensureStaff(current);
    })().catch((err) => { initPromise = null; throw err; });
    return initPromise;
}
export default app;
if (!isVercel) {
    ensureInitialized().then(() => {
        app.listen(PORT, () => console.log(`CareWeave API listening on http://localhost:${PORT} [storage: ${current.mode}]`));
    }).catch((err) => {
        console.error('Failed to start CareWeave API:', err.message);
        process.exitCode = 1;
    });
}
