import type { NextFunction, Request, Response } from 'express';
import { ConflictError, type Repos } from './repo/index.js';

/** A request that has passed the sign-in check: `user` is the signed-in staff member. */
export type SessionUser = { id: string; role: string; name?: string; [field: string]: any };
export type AuthedRequest = Request & { user: SessionUser };
/** A request on a route that may or may not be signed in (sign-in, public pages, limiters). */
export type MaybeAuthedRequest = Request & { user?: SessionUser };

/**
 * Fixed-window limiter. The count is kept in the database (one atomic upsert per request), so every server instance shares it
 * and a restart does not reset it. If the database cannot be reached the request is refused with 503 (fail closed).
 */
export function rateLimit(repos: () => Repos, name: string, windowMs: number, max: number, keyOf: (req: MaybeAuthedRequest) => string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let hit;
    try {
      hit = await repos().rateLimits.hit(`${name}:${keyOf(req)}`, windowMs);
    } catch (err: any) {
      // Fail closed: without counters the limit cannot be enforced, and these routes need the same database anyway.
      console.error(`Rate limiter could not reach the database (${name}):`, err?.message);
      return res.status(503).json({ error: 'Service temporarily unavailable. Try again shortly.' });
    }
    if (hit.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((hit.resetAt.getTime() - Date.now()) / 1000))));
      return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
    }
    next();
  };
}

export function roles(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!allowed.includes((req as AuthedRequest).user.role)) {
      return res.status(403).json({ error: 'This action is not permitted for your role' });
    }
    next();
  };
}

export const CONFLICT_MESSAGE = 'Record was changed by someone else, reload and retry';

/**
 * The version a write expects. A client that sent the version it last read is passed through even when the record has moved on: the
 * repo then merges the write if the changes since touched other fields, and refuses it (409) if they overlap. A client that sent no
 * version uses the version just read, which still catches another instance writing between this read and this write.
 */
export function expectedVersion(req: any, current: any): number {
  const sent = req.body?.version;
  if (sent === undefined || sent === null) return current.version;
  if (!Number.isInteger(Number(sent)) || Number(sent) > current.version || Number(sent) < 1) throw new ConflictError(CONFLICT_MESSAGE);
  return Number(sent);
}

export function errorHandler(err: any, _req: any, res: Response, _next: NextFunction) {
  if (err instanceof ConflictError) return res.status(409).json({ error: CONFLICT_MESSAGE });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
}
