import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const syntheticHistoryIndexes: IndexSpec[] = [idIndex];

export const syntheticHistoryRepo = (c: Collection) => ({
  ...baseRepo(c),
});
