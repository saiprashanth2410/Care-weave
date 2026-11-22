import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';
import type { CarePlan } from './types.js';

export const carePlansIndexes: IndexSpec[] = [idIndex, { keys: { patientId: 1 } }];

export const carePlansRepo = (c: Collection<CarePlan>) => ({
  ...baseRepo(c),
  newestFirst: (filter?: Record<string, any>) => c.find(filter, { sort: { createdAt: -1 } }),
});
