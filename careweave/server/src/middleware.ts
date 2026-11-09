import { ConflictError, type Repos } from './repo/index.js';

/**
 * Fixed-window limiter. The count is kept in the database (one atomic upsert per request), so every server instance shares it
 * and a restart does not reset it. If the database cannot be reached the request is refused with 503 (fail closed).
 */
export function rateLimit(repos: () => Repos, name: string, windowMs: number, max: number, keyOf: (req: any) => string) {
  return async (req: any, res: any, next: any) => {
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
  return (req: any, res: any, next: any) => {
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'This action is not permitted for your role' });
    }
    next();
  };
}

export const CONFLICT_MESSAGE = 'Record was changed by someone else, reload and retry';

/**
 * The version a write expects. A client that sent the version it last read gets a conflict at once when the record has moved on;
 * otherwise the version just read is used, which still catches another instance writing between this read and this write.
 */
export function expectedVersion(req: any, current: any): number {
  const sent = req.body?.version;
  if (sent === undefined || sent === null) return current.version;
  if (!Number.isInteger(Number(sent)) || Number(sent) !== current.version) throw new ConflictError(CONFLICT_MESSAGE);
  return current.version;
}

export function errorHandler(err: any, _req: any, res: any, _next: any) {
  if (err instanceof ConflictError) return res.status(409).json({ error: CONFLICT_MESSAGE });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
}
