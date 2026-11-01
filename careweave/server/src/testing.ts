import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { LocalStore, createRepos, type Store } from './repo/index.js';
import { buildSeed } from './seed.js';

// Helpers for tests: a server instance on a random port over a given store. Two instances over one store behave like two
// serverless instances over one database: each has its own process memory, and only the store is shared.

// server/.env is loaded by the app, and it can hold real credentials. Tests must never reach a real database or send a real message.
for (const k of ['MONGODB_URI', 'MONGO_URI', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'META_WHATSAPP_TOKEN', 'GEMINI_API_KEY', 'N8N_WEBHOOK_URL', 'WHATSAPP_API_KEY']) process.env[k] = '';
process.env.FIREBASE_PROJECT_ID = '';
process.env.ALLOW_LOCAL_LOGIN = 'true';

/** Where the optional MongoDB tests run: a local mongod only, unless CAREWEAVE_TEST_MONGODB_URI says otherwise. */
export const TEST_MONGODB_URI = process.env.CAREWEAVE_TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';

export async function memoryStore() {
  const store = new LocalStore(null);
  await store.load(async () => ({ ...(await buildSeed()) }));
  return store;
}

export async function startInstance(store: Store) {
  const repos = createRepos(store);
  const server = createApp({ repos }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}) => {
    const res = await fetch(url + path, {
      method,
      headers: { ...(opts.raw === undefined ? { 'content-type': 'application/json' } : {}), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
      body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
  const login = async (who = 'reception') =>
    (await call('POST', '/api/auth/login', { body: { email: `${who}@careweave.test`, password: 'demo123' } })).json.token as string;
  return { url, repos, call, login, close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); }) };
}
