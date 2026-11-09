import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

// Lab orders. The collection is named "labOrders"; `orders` is what the rest of the code calls it.
export const ordersIndexes: IndexSpec[] = [
  idIndex,
  { keys: { status: 1 } },
  { keys: { registeredPatientRef: 1 } },
  { keys: { patientId: 1 } },
  { keys: { orderedAt: -1 } },
  { keys: { updatedAt: 1 } },
];

export const ordersRepo = (c: Collection) => ({
  ...baseRepo(c),
  newestFirst: (filter?: Record<string, any>) => c.find(filter, { sort: { orderedAt: -1 } }),
  /** Orders that belong to a registered patient: linked by reference, or by the patient code on a non-external order. */
  forPatient: (p: { id: string; patientId: string }) =>
    c.find({ $or: [{ registeredPatientRef: p.id }, { patientId: p.patientId, external: { $ne: true } }] }, { sort: { orderedAt: -1 } }),
  forPatients: (ids: string[]) => c.find({ registeredPatientRef: { $in: ids } }),
});
