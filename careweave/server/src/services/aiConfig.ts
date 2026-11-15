import crypto from 'node:crypto';
import type { Repos } from '../repo/index.js';
import { now } from '../util.js';

// The Gemini key an administrator sets in the admin portal. It is encrypted (AES-256-GCM) before it is stored, the passcode that
// protects it is kept only as a salted scrypt hash, and the key is never sent to a browser except to an administrator who has just
// proved the passcode. GEMINI_API_KEY on the server still works when nothing has been set here.

const DOC = 'ai-config';
const MAX_TRIES = 5;
const LOCK_MS = 15 * 60 * 1000;
const CACHE_MS = 30_000;

export type AiFeatures = { scan: boolean; brief: boolean };
export type AiConfig = { key: string; model: string; features: AiFeatures; source: 'admin' | 'env' | 'none' };

/** The secret that seals the key: AI_CONFIG_KEY, else ATTACHMENT_KEY, else something only this deployment knows. */
function secret(): Buffer {
  const raw = (process.env.AI_CONFIG_KEY || process.env.ATTACHMENT_KEY || '').trim();
  const basis = raw || process.env.MONGODB_URI || process.env.FIREBASE_SERVICE_ACCOUNT || 'careweave-local-development';
  return crypto.createHash('sha256').update(`careweave-ai-config:${basis}`).digest();
}

export const seal = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secret(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
};

export const unseal = (stored: string): string | null => {
  try {
    const [iv, tag, body] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', secret(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString('utf8');
  } catch {
    return null; // sealed with another secret, or damaged
  }
};

const hashPasscode = (passcode: string) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('base64')}.${crypto.scryptSync(passcode, salt, 32).toString('base64')}`;
};
const passcodeMatches = (passcode: string, stored: string) => {
  const [salt, hash] = String(stored || '').split('.');
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(passcode, Buffer.from(salt, 'base64'), want.length);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
};

export class AiConfigError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const validKey = (k: unknown) => typeof k === 'string' && /^[\w-]{20,200}$/.test(k.trim());
export const validPasscode = (p: unknown) => typeof p === 'string' && p.trim().length >= 4 && p.length <= 100;

let cache: { at: number; value: AiConfig } | null = null;
export const forgetAiConfig = () => { cache = null; };

/** The key and settings the scanner and the brief use. Cached for a short time, so a change reaches every instance within it. */
export async function readAiConfig(repos: Repos): Promise<AiConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const doc = await repos.meta.byId(DOC).catch(() => null);
  const stored = doc?.cipher ? unseal(doc.cipher) : null;
  const env = (process.env.GEMINI_API_KEY || '').trim();
  const value: AiConfig = {
    key: stored || env,
    model: stored ? String(doc?.model || '') : '',
    features: { scan: doc?.features?.scan !== false, brief: doc?.features?.brief !== false },
    source: stored ? 'admin' : env ? 'env' : 'none',
  };
  cache = { at: Date.now(), value };
  return value;
}

/** What the admin page may see. Never the key itself. */
export async function aiStatus(repos: Repos) {
  const doc = await repos.meta.byId(DOC);
  const cfg = await readAiConfig(repos);
  return {
    configured: !!cfg.key,
    source: cfg.source,
    last4: doc?.last4 || '',
    hasPasscode: !!doc?.passHash,
    model: String(doc?.model || ''),
    features: cfg.features,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || '',
    lockedUntil: doc?.lockedUntil && doc.lockedUntil > now() ? doc.lockedUntil : null,
  };
}

/** Checks the passcode. Too many wrong tries lock further tries for a while (kept in the database, so every instance agrees). */
async function checkPasscode(repos: Repos, doc: any, passcode: unknown) {
  if (!doc?.passHash) throw new AiConfigError(400, 'No passcode has been set yet');
  if (doc.lockedUntil && doc.lockedUntil > now()) throw new AiConfigError(429, 'Too many wrong passcodes. Try again in a few minutes.');
  if (typeof passcode === 'string' && passcodeMatches(passcode.trim(), doc.passHash)) {
    if (doc.failed) await repos.meta.update(doc, { failed: 0, lockedUntil: undefined });
    return;
  }
  const failed = (doc.failed || 0) + 1;
  await repos.meta.update(doc, failed >= MAX_TRIES ? { failed: 0, lockedUntil: new Date(Date.now() + LOCK_MS).toISOString() } : { failed });
  throw new AiConfigError(403, failed >= MAX_TRIES ? 'Too many wrong passcodes. Try again in a few minutes.' : 'Incorrect passcode.');
}

const save = async (repos: Repos, doc: any, fields: Record<string, unknown>) => {
  forgetAiConfig();
  return doc ? repos.meta.update(doc, fields) : repos.meta.insert({ id: DOC, ...fields });
};

/** Sets the key. The first time it also sets the passcode; after that the passcode must be given. */
export async function setKey(repos: Repos, by: string, input: { apiKey: unknown; passcode: unknown; model?: unknown }) {
  if (!validKey(input.apiKey)) throw new AiConfigError(400, 'That does not look like a Gemini API key');
  const apiKey = String(input.apiKey).trim();
  const doc = await repos.meta.byId(DOC);
  let passHash = doc?.passHash;
  if (passHash) await checkPasscode(repos, doc, input.passcode);
  else {
    if (!validPasscode(input.passcode)) throw new AiConfigError(400, 'The passcode must be at least 4 characters');
    passHash = hashPasscode(String(input.passcode).trim());
  }
  await save(repos, doc ?? null, { cipher: seal(apiKey), last4: apiKey.slice(-4), passHash, updatedAt: now(), updatedBy: by, failed: 0 });
}

/** Returns the key to an administrator who proves the passcode. */
export async function revealKey(repos: Repos, passcode: unknown) {
  const doc = await repos.meta.byId(DOC);
  if (!doc?.cipher) throw new AiConfigError(404, 'No key has been saved here');
  await checkPasscode(repos, doc, passcode);
  const key = unseal(doc.cipher);
  if (!key) throw new AiConfigError(409, 'The saved key can no longer be read. Save it again.');
  return key;
}

export async function changePasscode(repos: Repos, by: string, input: { currentPasscode: unknown; newPasscode: unknown }) {
  const doc = await repos.meta.byId(DOC);
  await checkPasscode(repos, doc, input.currentPasscode);
  if (!validPasscode(input.newPasscode)) throw new AiConfigError(400, 'The new passcode must be at least 4 characters');
  await save(repos, doc, { passHash: hashPasscode(String(input.newPasscode).trim()), updatedAt: now(), updatedBy: by });
}

export async function removeKey(repos: Repos, passcode: unknown) {
  const doc = await repos.meta.byId(DOC);
  if (!doc?.cipher) throw new AiConfigError(404, 'No key has been saved here');
  await checkPasscode(repos, doc, passcode);
  forgetAiConfig();
  await repos.meta.remove({ id: DOC });
}

/** Which features use the key, and the model to prefer. Needs no passcode: it does not expose the key. */
export async function setOptions(repos: Repos, by: string, input: { scan?: unknown; brief?: unknown; model?: unknown }) {
  const doc = await repos.meta.byId(DOC);
  const cur = (await readAiConfig(repos)).features;
  const fields: Record<string, unknown> = {
    features: { scan: typeof input.scan === 'boolean' ? input.scan : cur.scan, brief: typeof input.brief === 'boolean' ? input.brief : cur.brief },
    updatedAt: now(), updatedBy: by,
  };
  if (input.model !== undefined) {
    const model = String(input.model).trim();
    if (model && !/^[\w.-]{2,60}$/.test(model)) throw new AiConfigError(400, 'That is not a model name');
    fields.model = model;
  }
  await save(repos, doc, fields);
}
