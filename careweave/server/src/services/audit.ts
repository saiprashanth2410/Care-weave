import type { Repos } from '../repo/index.js';
import { id, now } from '../util.js';

export type AuditFn = (req: any, action: string, entity: string, entityId: string, detail?: string) => Promise<void>;

export function makeAudit(repos: () => Repos) {
  const audit: AuditFn = async (req, action, entity, entityId, detail = '') => {
    await repos().audit.insert({
      id: id('audit'), actorId: req.user.id, actorRole: req.user.role, action, entity, entityId, detail, timestamp: now()
    });
  };

  // A screen that refreshes itself would otherwise write the same "opened the directory" entry every few seconds.
  const auditOnce = async (req: any, action: string, entity: string, entityId: string, detail: string, withinMs = 60_000) => {
    const since = new Date(Date.now() - withinMs).toISOString();
    const seen = await repos().audit.find({ actorId: req.user.id, action, entity, detail, timestamp: { $gte: since } }, { limit: 1 });
    if (!seen.length) await audit(req, action, entity, entityId, detail);
  };
  return { audit, auditOnce };
}
