import { ConflictError } from './repo/index.js';

// Small in-memory limiter: enough to slow password guessing and runaway uploads on one server instance. Each instance counts
// separately, so on several instances the effective limit is higher.
export function rateLimit(windowMs: number, max: number, keyOf: (req: any) => string) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: any, res: any, next: any) => {
    const k = keyOf(req);
    const t = Date.now();
    const h = hits.get(k);
    if (!h || h.reset < t) {
      hits.set(k, { n: 1, reset: t + windowMs });
      if (hits.size > 5000) for (const [key, v] of hits) if (v.reset < t) hits.delete(key);
      return next();
    }
    if (h.n >= max) {
      res.setHeader('Retry-After', String(Math.ceil((h.reset - t) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
    }
    h.n++;
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
