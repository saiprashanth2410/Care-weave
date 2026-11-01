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

// Browsers hold the token in an httpOnly cookie, so page scripts can never read it. Scripts and tests send it as a Bearer header.
export const COOKIE = 'cw_session';
/** Browser clients send this header on every request; for a state-changing request it is the CSRF guard (see `auth` in app.ts). */
export const BROWSER_HEADER = 'x-cw-session';

function cookieOf(req: any, name: string) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

/** The token on a request and where it came from. A Bearer header wins over the cookie. */
export function credentialOf(req: any): { token: string; via: 'bearer' | 'cookie' | null } {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (bearer) return { token: bearer, via: 'bearer' };
  const cookie = cookieOf(req, COOKIE);
  return cookie ? { token: cookie, via: 'cookie' } : { token: '', via: null };
}
export const tokenOf = (req: any) => credentialOf(req).token;

export function sessionCookie(token: string, secure: boolean, maxAgeMs = SESSION_MS) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`;
}
export const clearedCookie = (secure: boolean) => sessionCookie('', secure, 0);

export async function userForToken(repos: Repos, raw: string) {
  if (!raw) return null;
  const s = await repos.sessions.find(hashToken(raw));
  return s ? repos.users.byId(s.userId) : null;
}

export const endSession = (repos: Repos, req: any) => repos.sessions.remove(hashToken(tokenOf(req)));
