import crypto from 'node:crypto';
import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { isExasolConfigured } from '../exasol/client.js';
import { runAnalyticsSync } from '../services/analytics.js';

/** Constant-time comparison of a presented secret with the configured one. */
const sameSecret = (given: string, wanted: string) => {
  const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(wanted).digest();
  return crypto.timingSafeEqual(a, b);
};

/**
 * A scheduler (for example a Vercel cron job) calls this to run the incremental Exasol sync. It is not behind staff sign-in: it
 * needs `Authorization: Bearer <CRON_SECRET>`, and does nothing at all when CRON_SECRET is not set.
 */
export function cronRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  router.get('/analytics/cron', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not set, so scheduled sync is switched off' });
    const given = String(req.get('authorization') || '').replace(/^Bearer /, '');
    if (!given || !sameSecret(given, secret)) return res.status(401).json({ error: 'Invalid cron secret' });
    if (!isExasolConfigured()) return res.json({ skipped: true, reason: 'Exasol is not configured' });
    const out = await runAnalyticsSync(ctx.repos);
    res.status(out.busy ? 409 : out.success ? 200 : 502).json(out);
  });
  return router;
}
