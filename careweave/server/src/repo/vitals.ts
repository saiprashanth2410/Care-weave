import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';
import type { Vital } from './types.js';

export const vitalsIndexes: IndexSpec[] = [idIndex, { keys: { patientId: 1, date: -1 } }];

export const vitalsRepo = (c: Collection<Vital>) => ({
  ...baseRepo(c),
  forPatient: (patientId: string, limit?: number) => c.find({ patientId }, { sort: { date: -1 }, limit }),
});
