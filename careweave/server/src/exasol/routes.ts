import type { IRouter, Request, Response } from 'express';
import type { Repos } from '../repo/index.js';
import { getAnalyticsEngineStatus } from './client.js';
import { getAnalyticsOverview } from './queries.js';
import { forceFullNextSync, overviewSnapshot, runAnalyticsSync, syncStatus } from '../services/analytics.js';
import { generateSampleHistory } from './sampleHistory.js';

interface AnalyticsCtx {
  app: IRouter;
  repos: () => Repos;
  roles: (...allowed: string[]) => any;
  audit: (req: any, action: string, entity: string, entityId: string, detail: string) => Promise<void>;
  sampleAllowed: boolean;
}

export function registerExasolAnalyticsRoutes({ app, repos, roles, audit, sampleAllowed }: AnalyticsCtx) {
  /**
   * Health and telemetry endpoint for Exasol analytics engine.
   */
  app.get('/analytics/health', async (_req: Request, res: Response) => {
    try {
      const status = await getAnalyticsEngineStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({
        connected: false,
        engine: 'Application Store (Exasol offline)',
        error: err?.message || 'Health check error',
      });
    }
  });

  /**
   * Main analytics overview: Aggregates hospital operations, pharmacy intelligence, and lab TAT.
   * Accessible to all hospital clinical roles (receptionist, doctor, lab).
   */
  app.get('/analytics/overview', roles('receptionist', 'doctor', 'lab'), async (req: Request, res: Response) => {
    try {
      const snapshot = await overviewSnapshot(repos());
      const overview = await getAnalyticsOverview(snapshot);
      // The window applies to the figures computed here; when Exasol answers, its tables hold all history.
      res.json({ ...overview, fallbackWindowDays: snapshot.windowDays });
    } catch (err: any) {
      console.error('[Analytics Overview Error]:', err);
      res.status(500).json({ error: 'Failed to generate healthcare analytics overview' });
    }
  });

  /**
   * Triggers synchronous data pipeline to load MongoDB records into Exasol.
   */
  /**
   * Adds or removes a reproducible, clearly synthetic 30-day history (visits, lab orders, prescriptions) for the analytics only.
   * It is kept apart from the records the portals show.
   */
  app.post('/analytics/sample-history', roles('receptionist', 'doctor', 'lab'), async (req: any, res: Response) => {
    if (!sampleAllowed) return res.status(403).json({ error: 'Sample data is switched off on this server' });
    const history = repos().syntheticHistory;
    if (req.body?.remove === true) {
      const n = await history.remove({});
      await forceFullNextSync(repos());
      await audit(req, 'delete', 'sample-history', 'analytics', `Removed ${n} synthetic records`);
      return res.json({ removed: n });
    }
    const existing = await history.count();
    if (existing) return res.json({ added: 0, total: existing, note: 'Sample history is already loaded' });
    const rows = generateSampleHistory();
    try {
      await history.insertMany(rows);
    } catch (err) {
      await history.remove({}).catch(() => {}); // a partly loaded history would be reported as "already loaded"
      throw err;
    }
    await audit(req, 'create', 'sample-history', 'analytics', `Loaded ${rows.length} synthetic records`);
    res.status(201).json({ added: rows.length, total: rows.length });
  });

  app.get('/analytics/sync-status', roles('receptionist', 'doctor', 'lab'), async (_req: Request, res: Response) => res.json(await syncStatus(repos())));

  app.post('/analytics/sync', roles('receptionist', 'doctor', 'lab'), async (req: any, res: Response) => {
    try {
      const result = await runAnalyticsSync(repos(), { full: req.body?.full === true });
      if (result.busy) return res.status(409).json(result);
      await audit(
        req,
        result.success ? 'sync' : 'sync-failed',
        'exasol-analytics',
        'exasol-engine',
        result.success
          ? `Synced (${result.mode}) ${result.syncedVisits} visits, ${result.syncedLabOrders} lab orders, ${result.syncedPrescriptions} prescriptions in ${result.durationMs} ms`
          : `Sync failed: ${result.error}`
      );
      // A failed sync is an error response, so the client cannot mistake it for a success.
      res.status(result.success ? 200 : 502).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Sync pipeline failed' });
    }
  });
}
