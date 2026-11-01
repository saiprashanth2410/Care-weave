import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const externalRecordsIndexes: IndexSpec[] = [idIndex, { keys: { patientId: 1 } }];

export const externalRecordsRepo = (c: Collection) => ({
  ...baseRepo(c),
});
