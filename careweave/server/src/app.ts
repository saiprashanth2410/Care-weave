import { SERVER_DIR } from './env.js';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import helmet from 'helmet';
import { catchAsyncRoutes } from './asyncRoutes.js';
import { errorHandler, rateLimit, roles } from './middleware.js';
import type { Repos } from './repo/index.js';
import type { AppConfig, AppCtx } from './context.js';
import { makeAudit } from './services/audit.js';
import { BROWSER_HEADER, credentialOf, userForToken } from './services/sessions.js';
import { authRoutes, sessionRoutes } from './routes/auth.js';
import { adminRoutes, healthRoutes } from './routes/admin.js';
import { patientRoutes } from './routes/patients.js';
import { appointmentRoutes } from './routes/appointments.js';
import { labRoutes, UPLOAD_ROUTES } from './routes/lab.js';
import { doctorRoutes } from './routes/doctor.js';
import { LiveHub } from './liveEvents.js';
import { whatsappPublicRoutes, whatsappSimulatorRoutes } from './whatsapp/routes.js';

export type CreateAppOptions = { repos: Repos | (() => Repos); config?: Partial<AppConfig>; live?: LiveHub };

/** Wires middleware and routers. All data access goes through `repos`; this file holds no state of its own. */
export function createApp(opts: CreateAppOptions) {
  const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const isProd = process.env.NODE_ENV === 'production';
  const PORT = Number(process.env.PORT || 4000);
  const app = express();
  catchAsyncRoutes(app);
  const getRepos = typeof opts.repos === 'function' ? opts.repos : () => opts.repos as Repos;
  const config: AppConfig = {
    isVercel, isProd, port: PORT,
    uploadsDir: isVercel ? '/tmp/uploads' : path.join(SERVER_DIR, 'uploads'),
    // One labelled, made-up patient journey for demonstrations. Off when ALLOW_SAMPLE_DATA=false, and off by default in production.
    sampleAllowed: process.env.ALLOW_SAMPLE_DATA ? process.env.ALLOW_SAMPLE_DATA === 'true' : !isProd,
    ...opts.config,
  };
  const { audit, auditOnce } = makeAudit(getRepos);
  const ctx: AppCtx = {
    get repos() { return getRepos(); },
    audit, auditOnce, roles, config,
    live: opts.live ?? new LiveHub(getRepos),
    async auth(req: any, res: any, next: any) {
      const { token, via } = credentialOf(req);
      const u = await userForToken(getRepos(), token);
      if (!u) return res.status(401).json({ error: 'Authentication required' });
      // A cookie is sent by the browser on any request to this site, including one a hostile page triggers. SameSite=Strict
      // already stops that; this custom header (which a cross-site page cannot add) is the second guard.
      if (via === 'cookie' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get(BROWSER_HEADER) !== 'cookie') {
        return res.status(403).json({ error: 'Missing browser session header' });
      }
      req.user = u;
      next();
    },
    limits: {
      login: rateLimit(getRepos, 'login', 15 * 60 * 1000, 10, (r) => `${r.ip}|${String(r.body?.email || '').toLowerCase()}`),
      upload: rateLimit(getRepos, 'upload', 60 * 1000, 20, (r) => `${r.user?.id || r.ip}`),
    },
  };

  // The API only returns JSON, so the strictest policy is safe: no scripts, frames or subresources may load from an API response.
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  // Browsers on these origins may call the API. CLIENT_ORIGIN is a comma-separated list. Requests with no Origin
  // header (same-origin, curl, server to server) are not a CORS concern and pass. Outside production, localhost is open.
  const allowedOrigins = String(process.env.CLIENT_ORIGIN || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  app.use(cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const ok = allowedOrigins.includes(origin) || (!config.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
      cb(null, ok);
    },
  }));

  // The WhatsApp webhook verifies a signature over the raw bytes, so it reads its own body and must come before the JSON parser.
  app.use(whatsappPublicRoutes({ repos: () => ctx.repos }));

  // 1 MB of JSON everywhere, except the two routes that carry a base64 file (a 10 MB scan or attachment arrives as about 14 MB).
  const small = express.json({ limit: '1mb' });
  const large = express.json({ limit: '14mb' });
  app.use((req, res, next) => (req.method === 'POST' && UPLOAD_ROUTES.some((r) => r.test(req.path)) ? large : small)(req, res, next));

  app.use('/api', healthRoutes(ctx));
  app.use('/api', authRoutes(ctx));
  app.use('/api', ctx.auth);
  app.use('/api', sessionRoutes(ctx));
  app.use('/api', whatsappSimulatorRoutes({ repos: () => ctx.repos }));
  app.use('/api', adminRoutes(ctx));
  app.use('/api', patientRoutes(ctx));
  app.use('/api', appointmentRoutes(ctx));
  app.use('/api', labRoutes(ctx));
  app.use('/api', doctorRoutes(ctx));

  app.use(errorHandler);
  return app;
}

