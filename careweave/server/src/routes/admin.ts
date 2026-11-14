import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { removeUnfinishedSample } from '../services/sampleCleanup.js';
import { isoToday } from '../util.js';
import { doctorDashboard } from '../services/chart.js';
import { startSession } from '../services/sessions.js';
import { runScenario } from '../scenario.js';
import { registerExasolAnalyticsRoutes } from '../exasol/routes.js';

/** Open before sign-in. */
export function healthRoutes(ctx: AppCtx) {
  const router = Router();
  router.get('/health', (_, res) =>
    res.json({
      ok: true,
      service: 'careweave-api',
      database: ctx.repos.mode === 'mongo' ? 'mongodb' : 'local-json',
      atlasConnected: ctx.repos.mode === 'mongo'
    })
  );
  return router;
}

/** Dashboard, live events, the sample scenario and analytics. All behind the staff sign-in. */
export function adminRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;

  // ── Audit log ───────────────────────────────────────────────────────────────
  // Only staff granted the 'audit' permission can read it, and reading it is itself recorded.
  const auditors = (req: any, res: any, next: any) =>
    (req.user.permissions || []).includes('audit') ? next() : res.status(403).json({ error: 'Reading the audit log needs the audit permission' });
  const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const iso = (v: unknown) => { const s = str(v, 40); return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : ''; };
  const pageSize = (v: unknown) => Math.min(200, Math.max(1, Number.parseInt(String(v ?? ''), 10) || 50));

  router.get('/audit', auditors, async (req: any, res) => {
    const q = req.query;
    const filters = { actorId: str(q.actorId), action: str(q.action), entity: str(q.entity), entityId: str(q.entityId), from: iso(q.from), before: iso(q.before) };
    const rows = await ctx.repos.audit.search(filters, pageSize(q.limit));
    const used = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
    await ctx.auditOnce(req, 'read', 'audit-log', 'directory', used.length ? `Filtered by ${used.join(', ')}` : 'Viewed the audit log');
    res.json({ rows, nextBefore: rows.length ? rows[rows.length - 1].timestamp : null });
  });

  // Who has opened, changed or been refused this patient's chart. Accepts the patient's id or their UHID.
  router.get('/patients/:id/access-log', auditors, async (req: any, res) => {
    const p = await ctx.repos.patients.byRef(String(req.params.id));
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    const rows = await ctx.repos.audit.search({ entity: 'patient', entityId: p.id, before: iso(req.query.before) }, pageSize(req.query.limit));
    await ctx.auditOnce(req, 'read', 'access-log', p.id, `Viewed who accessed ${p.name}'s chart`);
    res.json({ patient: { id: p.id, patientId: p.patientId, name: p.name }, rows, nextBefore: rows.length ? rows[rows.length - 1].timestamp : null });
  });

  // Live updates. A serverless host cannot hold the connection open, so there the screens fall back to polling.
  router.get('/events', (req: any, res) => {
    if (ctx.config.isVercel) return res.status(204).end();
    ctx.live.addClient(res, req.user.id, req.user.role);
  });

  router.get('/dashboard', async (req: any, res) => {
    if (req.user.role === 'admin') return res.status(403).json({ error: 'Administrators do not see clinical data' });
    if (req.user.role === 'doctor') return res.json(await doctorDashboard(ctx.repos, req.user));
    // Today's list is one day's rows; the all-time figures are counts in the database, not a scan of every appointment.
    const A = ctx.repos.appointments;
    const [todayAppts, patients, waiting, checkedIn, inConsultation, completed, cancelled] = await Promise.all([
      A.onDay(isoToday()), ctx.repos.patients.count(),
      A.count({ status: { $in: ['Waiting', 'Checked in', 'Checked In'] } }), A.count({ status: { $in: ['Checked in', 'Checked In'] } }),
      A.count({ status: 'In Consultation' }), A.count({ status: 'Completed' }), A.count({ status: 'Cancelled' }),
    ]);
    const n = (list: any[], ...statuses: string[]) => list.filter((a: any) => statuses.includes(a.status)).length;
    const stats = {
      patients,
      appointments: todayAppts.length,
      waiting, checkedIn, inConsultation, completed, cancelled,
      todayCompleted: n(todayAppts, 'Completed'),
      todayScheduled: n(todayAppts, 'Scheduled'),
    };
    res.json({ stats, appointments: todayAppts.sort((a: any, b: any) => String(a.time).localeCompare(String(b.time))) });
  });

  // ── Synthetic sample scenario ───────────────────────────────────────────────
  // One labelled, made-up patient journey for demonstrations. Off when ALLOW_SAMPLE_DATA=false, and off by default in production.
  let scenarioRunning = false;
  router.get('/demo/scenario', async (_req, res) =>
    res.json({ available: ctx.config.sampleAllowed, loaded: (await ctx.repos.patients.count({ sample: true })) > 0 }));
  router.post('/demo/scenario', roles('receptionist', 'doctor', 'lab'), async (req: any, res) => {
    if (!ctx.config.sampleAllowed) return res.status(403).json({ error: 'Sample data is switched off on this server' });
    if (scenarioRunning) return res.status(409).json({ error: 'The sample scenario is already loading' });
    scenarioRunning = true;
    try {
      const mint = (userId: string) => startSession(ctx.repos, userId, 5 * 60 * 1000);
      const users = await ctx.repos.users.find();
      const samples = await ctx.repos.patients.find({ sample: true });
      const out = await runScenario(`http://127.0.0.1:${ctx.config.port}`, users, samples, mint, req.user);
      if (out.loaded) {
        const p = await ctx.repos.patients.byCode(out.patientId || '');
        if (p) await ctx.repos.patients.update(p, { sample: true });
        await audit(req, 'create', 'sample-scenario', out.patientId || '', 'Loaded synthetic sample scenario');
      }
      res.status(out.loaded ? 201 : 200).json(out);
    } catch (err: any) {
      const removed = await removeUnfinishedSample(ctx.repos).catch((e: any) => { console.error('Could not clean up the half-loaded sample scenario:', e?.message); return 0; });
      res.status(500).json({ error: `${err?.message || 'Could not load the sample scenario'}${removed ? ' (the partly loaded sample was removed; try again)' : ''}` });
    } finally {
      scenarioRunning = false;
    }
  });

  registerExasolAnalyticsRoutes({ app: router, repos: () => ctx.repos, roles, audit, sampleAllowed: ctx.config.sampleAllowed });
  return router;
}
