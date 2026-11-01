import crypto from 'node:crypto';
import type { Repos } from '../repo/index.js';

export const SESSION_MS = 8 * 60 * 60 * 1000;

/** The database holds only this hash, so a copy of it is not a usable sign-in. */
export const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export async function startSession(repos: Repos, userId: string, ttlMs = SESSION_MS) {
  const token = crypto.randomBytes(32).toString('hex');
  await repos.sessions.create(hashToken(token), userId, new Date(Date.now() + ttlMs));
  return token;
}

export const tokenOf = (req: any) => String(req.headers.authorization || '').replace('Bearer ', '');

export async function userForRequest(repos: Repos, req: any) {
  const raw = tokenOf(req);
  if (!raw) return null;
  const s = await repos.sessions.find(hashToken(raw));
  return s ? repos.users.byId(s.userId) : null;
}

export const endSession = (repos: Repos, req: any) => repos.sessions.remove(hashToken(tokenOf(req)));
