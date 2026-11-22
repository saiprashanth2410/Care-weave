import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';
import type { ReconCase } from './types.js';

export const casesIndexes: IndexSpec[] = [idIndex, { keys: { status: 1 } }, { keys: { recordId: 1 } }];

export const casesRepo = (c: Collection<ReconCase>) => ({
  ...baseRepo(c),
  newestFirst: (filter?: Record<string, any>) => c.find(filter, { sort: { createdAt: -1 } }),
});
