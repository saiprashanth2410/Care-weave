import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { addClient } from '../liveEvents.js';
import { isToday } from '../util.js';
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

  // Live updates. A serverless host cannot hold the connection open, so there the screens fall back to polling.
  router.get('/events', (req: any, res) => {
    if (ctx.config.isVercel) return res.status(204).end();
    addClient(res, req.user.id, req.user.role);
  });

  router.get('/dashboard', async (req: any, res) => {
    if (req.user.role === 'doctor') return res.json(await doctorDashboard(ctx.repos, req.user));
    const [appointments, patients, recent] = await Promise.all([ctx.repos.appointments.find(), ctx.repos.patients.count(), ctx.repos.audit.recent(15)]);
    const todayAppts = appointments.filter((a: any) => isToday(a.date));
    const n = (list: any[], ...statuses: string[]) => list.filter((a: any) => statuses.includes(a.status)).length;
    const stats = {
      patients,
      appointments: todayAppts.length,
      waiting: n(appointments, 'Waiting', 'Checked in', 'Checked In'),
      checkedIn: n(appointments, 'Checked in', 'Checked In'),
      inConsultation: n(appointments, 'In Consultation'),
      completed: n(appointments, 'Completed'),
      cancelled: n(appointments, 'Cancelled'),
      todayCompleted: n(todayAppts, 'Completed'),
      todayScheduled: n(todayAppts, 'Scheduled'),
    };
    res.json({ stats, appointments: todayAppts.sort((a: any, b: any) => String(a.time).localeCompare(String(b.time))), recent });
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
      res.status(500).json({ error: err?.message || 'Could not load the sample scenario' });
    } finally {
      scenarioRunning = false;
    }
  });

  registerExasolAnalyticsRoutes({ app: router, repos: () => ctx.repos, roles, audit, sampleAllowed: ctx.config.sampleAllowed });
  return router;
}
