import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';
import type { AuditEntry } from './types.js';

export const auditIndexes: IndexSpec[] = [idIndex, { keys: { timestamp: -1 } }, { keys: { actorId: 1, timestamp: -1 } }, { keys: { entity: 1, entityId: 1, timestamp: -1 } }];

export const auditRepo = (c: Collection<AuditEntry>) => ({
  ...baseRepo(c),
  recent: (limit: number, actorId?: string) => c.find(actorId ? { actorId } : {}, { sort: { timestamp: -1 }, limit }),
  /** Newest first. Every filter is optional; `before` pages backwards from a timestamp. */
  search: (f: { actorId?: string; action?: string; entity?: string; entityId?: string; from?: string; before?: string }, limit: number) => {
    const filter: Record<string, any> = {};
    if (f.actorId) filter.actorId = f.actorId;
    if (f.action) filter.action = f.action;
    if (f.entity) filter.entity = f.entity;
    if (f.entityId) filter.entityId = f.entityId;
    const range: Record<string, string> = {};
    if (f.from) range.$gte = f.from;
    if (f.before) range.$lt = f.before;
    if (Object.keys(range).length) filter.timestamp = range;
    return c.find(filter, { sort: { timestamp: -1 }, limit });
  },
});
