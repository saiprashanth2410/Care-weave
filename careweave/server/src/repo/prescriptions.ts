import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const prescriptionsIndexes: IndexSpec[] = [idIndex, { keys: { patientId: 1, date: -1 } }, { keys: { prescribingClinician: 1 } }, { keys: { updatedAt: 1 } }];

export const prescriptionsRepo = (c: Collection) => ({
  ...baseRepo(c),
  forPatient: (patientId: string) => c.find({ patientId }, { sort: { date: -1 } }),
});
