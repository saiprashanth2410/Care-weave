import { getAnalyticsEngineStatus } from './client.js';
import { getAnalyticsOverview } from './queries.js';
import { syncDataToExasol } from './sync.js';
import { generateSampleHistory } from './sampleHistory.js';
export function registerExasolAnalyticsRoutes({ app, db, roles, audit, save, sampleAllowed }) {
    /**
     * Health and telemetry endpoint for Exasol analytics engine.
     */
    app.get('/api/analytics/health', async (_req, res) => {
        try {
            const status = await getAnalyticsEngineStatus();
            res.json(status);
        }
        catch (err) {
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
    app.get('/api/analytics/overview', roles('receptionist', 'doctor', 'lab'), async (req, res) => {
        try {
            const overview = await getAnalyticsOverview(db());
            res.json(overview);
        }
        catch (err) {
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
    app.post('/api/analytics/sample-history', roles('receptionist', 'doctor', 'lab'), async (req, res) => {
        if (!sampleAllowed)
            return res.status(403).json({ error: 'Sample data is switched off on this server' });
        const d = db();
        d.syntheticHistory ||= [];
        if (req.body?.remove === true) {
            const n = d.syntheticHistory.length;
            d.syntheticHistory.length = 0;
            audit(req, 'delete', 'sample-history', 'analytics', `Removed ${n} synthetic records`);
            await save();
            return res.json({ removed: n });
        }
        if (d.syntheticHistory.length)
            return res.json({ added: 0, total: d.syntheticHistory.length, note: 'Sample history is already loaded' });
        d.syntheticHistory.push(...generateSampleHistory());
        audit(req, 'create', 'sample-history', 'analytics', `Loaded ${d.syntheticHistory.length} synthetic records`);
        await save();
        res.status(201).json({ added: d.syntheticHistory.length, total: d.syntheticHistory.length });
    });
    app.post('/api/analytics/sync', roles('receptionist', 'doctor', 'lab'), async (req, res) => {
        try {
            const result = await syncDataToExasol(db());
            audit(req, result.success ? 'sync' : 'sync-failed', 'exasol-analytics', 'exasol-engine', result.success
                ? `Synced ${result.syncedVisits} visits, ${result.syncedLabOrders} lab orders, ${result.syncedPrescriptions} prescriptions in ${result.durationMs} ms`
                : `Sync failed: ${result.error}`);
            // A failed sync is an error response, so the client cannot mistake it for a success.
            res.status(result.success ? 200 : 502).json(result);
        }
        catch (err) {
            res.status(500).json({ error: err?.message || 'Sync pipeline failed' });
        }
    });
}
