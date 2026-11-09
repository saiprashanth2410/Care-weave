import type { Repos } from './repo/index.js';
import type { LiveHub } from './liveEvents.js';
import type { AuditFn } from './services/audit.js';

export type AppConfig = {
  isVercel: boolean;
  isProd: boolean;
  port: number;
  uploadsDir: string;
  sampleAllowed: boolean;
};

/** What every router receives. `repos` is read at call time because the database connects after the routes are registered. */
export type AppCtx = {
  readonly repos: Repos;
  audit: AuditFn;
  auditOnce: (req: any, action: string, entity: string, entityId: string, detail: string, withinMs?: number) => Promise<void>;
  auth: (req: any, res: any, next: any) => any;
  roles: (...allowed: string[]) => (req: any, res: any, next: any) => any;
  limits: { login: any; upload: any };
  config: AppConfig;
  live: LiveHub;
};
