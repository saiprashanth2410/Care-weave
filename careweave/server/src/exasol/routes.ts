import type { IRouter, Request, Response } from 'express';
import type { Repos } from '../repo/index.js';
import { getAnalyticsEngineStatus } from './client.js';
import { getAnalyticsOverview } from './queries.js';
import { syncDataToExasol } from './sync.js';
import { generateSampleHistory } from './sampleHistory.js';

interface AnalyticsCtx {
  app: IRouter;
  repos: () => Repos;
  roles: (...allowed: string[]) => any;
  audit: (req: any, action: string, entity: string, entityId: string, detail: string) => Promise<void>;
  sampleAllowed: boolean;
}

/**
 * The analytics read whole collections on purpose: the Exasol sync is a periodic bulk load, and the overview falls back to
 * computing over the same rows when Exasol is offline. Nothing else in the server loads a whole collection.
 */
async function analyticsSnapshot(repos: Repos) {
  const [patients, appointments, labOrders, prescriptions, syntheticHistory] = await Promise.all([
    repos.patients.find(), repos.appointments.find(), repos.orders.find(), repos.prescriptions.find(), repos.syntheticHistory.find(),
  ]);
  return { patients, appointments, labOrders, prescriptions, syntheticHistory };
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
      const overview = await getAnalyticsOverview(await analyticsSnapshot(repos()));
      res.json(overview);
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
      await audit(req, 'delete', 'sample-history', 'analytics', `Removed ${n} synthetic records`);
      return res.json({ removed: n });
    }
    const existing = await history.count();
    if (existing) return res.json({ added: 0, total: existing, note: 'Sample history is already loaded' });
    const rows = generateSampleHistory();
    await history.insertMany(rows);
    await audit(req, 'create', 'sample-history', 'analytics', `Loaded ${rows.length} synthetic records`);
    res.status(201).json({ added: rows.length, total: rows.length });
  });

  app.post('/analytics/sync', roles('receptionist', 'doctor', 'lab'), async (req: any, res: Response) => {
    try {
      const result = await syncDataToExasol(await analyticsSnapshot(repos()));
      await audit(
        req,
        result.success ? 'sync' : 'sync-failed',
        'exasol-analytics',
        'exasol-engine',
        result.success
          ? `Synced ${result.syncedVisits} visits, ${result.syncedLabOrders} lab orders, ${result.syncedPrescriptions} prescriptions in ${result.durationMs} ms`
          : `Sync failed: ${result.error}`
      );
      // A failed sync is an error response, so the client cannot mistake it for a success.
      res.status(result.success ? 200 : 502).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Sync pipeline failed' });
    }
  });
}
