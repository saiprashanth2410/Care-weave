import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const encountersIndexes: IndexSpec[] = [idIndex, { keys: { patientId: 1, date: -1 } }, { keys: { doctorId: 1 } }];

export const encountersRepo = (c: Collection) => ({
  ...baseRepo(c),
  forPatient: (patientId: string, limit?: number) => c.find({ patientId }, { sort: { date: -1 }, limit }),
  forDoctor: (doctorId: string) => c.find({ doctorId }),
});
