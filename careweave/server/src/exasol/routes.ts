import type { Express, Request, Response } from 'express';
import { getAnalyticsEngineStatus, pingExasol } from './client.js';
import { getAnalyticsOverview } from './queries.js';
import { syncDataToExasol } from './sync.js';

interface AnalyticsCtx {
  app: Express;
  db: () => any;
  roles: (...allowed: string[]) => any;
  audit: (req: any, action: string, entity: string, entityId: string, detail: string) => void;
}

export function registerExasolAnalyticsRoutes({ app, db, roles, audit }: AnalyticsCtx) {
  /**
   * Health and telemetry endpoint for Exasol analytics engine.
   */
  app.get('/api/analytics/health', async (_req: Request, res: Response) => {
    try {
      const status = await getAnalyticsEngineStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({
        connected: false,
        engine: 'MongoDB Analytics Pipeline (Fallback)',
        error: err?.message || 'Health check error',
      });
    }
  });

  /**
   * Main analytics overview: Aggregates hospital operations, pharmacy intelligence, and lab TAT.
   * Accessible to all hospital clinical roles (receptionist, doctor, lab).
   */
  app.get('/api/analytics/overview', roles('receptionist', 'doctor', 'lab'), async (req: Request, res: Response) => {
    try {
      const overview = await getAnalyticsOverview(db());
      res.json(overview);
    } catch (err: any) {
      console.error('[Analytics Overview Error]:', err);
      res.status(500).json({ error: 'Failed to generate healthcare analytics overview' });
    }
  });

  /**
   * Triggers synchronous data pipeline to load MongoDB records into Exasol.
   */
  app.post('/api/analytics/sync', roles('receptionist', 'doctor', 'lab'), async (req: any, res: Response) => {
    try {
      const result = await syncDataToExasol(db());
      audit(
        req,
        'sync',
        'exasol-analytics',
        'exasol-engine',
        `Synced ${result.syncedVisits} visits, ${result.syncedLabOrders} lab orders, ${result.syncedPrescriptions} prescriptions`
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Sync pipeline failed' });
    }
  });
}
