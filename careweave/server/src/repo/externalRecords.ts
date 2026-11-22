import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';
import type { ExternalRecord } from './types.js';

export const externalRecordsIndexes: IndexSpec[] = [idIndex, { keys: { patientId: 1 } }];

export const externalRecordsRepo = (c: Collection<ExternalRecord>) => ({
  ...baseRepo(c),
});
