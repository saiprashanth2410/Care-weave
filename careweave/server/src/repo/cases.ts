import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const casesIndexes: IndexSpec[] = [idIndex, { keys: { status: 1 } }, { keys: { recordId: 1 } }];

export const casesRepo = (c: Collection) => ({
  ...baseRepo(c),
  newestFirst: (filter?: Record<string, any>) => c.find(filter, { sort: { createdAt: -1 } }),
});
