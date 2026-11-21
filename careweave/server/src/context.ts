import type { Repos } from './repo/index.js';
import type { LiveHub } from './liveEvents.js';
import type { AuditFn } from './services/audit.js';
import type { FirebaseUsers } from './services/firebaseUsers.js';
import type { AuthedRequest } from './middleware.js';
import type { NextFunction, Response } from 'express';

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
  auditOnce: (req: AuthedRequest, action: string, entity: string, entityId: string, detail: string, withinMs?: number) => Promise<void>;
  auth: (req: AuthedRequest, res: Response, next: NextFunction) => any;
  roles: (...allowed: string[]) => (req: AuthedRequest, res: Response, next: NextFunction) => any;
  limits: { login: any; upload: any };
  config: AppConfig;
  live: LiveHub;
  firebaseUsers: FirebaseUsers;
};
