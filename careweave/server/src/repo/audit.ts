import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const auditIndexes: IndexSpec[] = [idIndex, { keys: { timestamp: -1 } }, { keys: { actorId: 1, timestamp: -1 } }];

export const auditRepo = (c: Collection) => ({
  ...baseRepo(c),
  recent: (limit: number, actorId?: string) => c.find(actorId ? { actorId } : {}, { sort: { timestamp: -1 }, limit }),
});
