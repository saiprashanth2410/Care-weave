import type { Express } from 'express';

// Express 4 does not catch a rejected async handler: one bad request body would crash the whole process.
// Wrapping every route handler once makes a throw reach the error middleware instead.
export function catchAsyncRoutes(app: Express) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const register = (app[method] as any).bind(app);
    (app as any)[method] = (path: any, ...handlers: any[]) =>
      handlers.length === 0
        ? register(path)
        : register(path, ...handlers.map((h) => (typeof h === 'function' && h.length < 4
            ? (req: any, res: any, next: any) => Promise.resolve(h(req, res, next)).catch(next)
            : h)));
  }
}
