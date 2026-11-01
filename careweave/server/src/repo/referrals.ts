import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const referralsIndexes: IndexSpec[] = [idIndex, { keys: { patientId: 1 } }];

export const referralsRepo = (c: Collection) => ({
  ...baseRepo(c),
  newestFirst: (filter?: Record<string, any>) => c.find(filter, { sort: { date: -1 } }),
});
