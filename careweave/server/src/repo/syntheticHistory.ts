import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const syntheticHistoryIndexes: IndexSpec[] = [idIndex, { keys: { updatedAt: 1 } }];

export const syntheticHistoryRepo = (c: Collection) => ({
  ...baseRepo(c),
});
