import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

// Short-lived messages between server instances: { id, at, origin, type, data, to? }. MongoDB deletes them after `expireAt`.
export const liveEventsIndexes: IndexSpec[] = [idIndex, { keys: { at: 1 } }, { keys: { expireAt: 1 }, expireAfterSeconds: 0 }];

export const liveEventsRepo = (c: Collection) => ({
  ...baseRepo(c),
  /** Events written at or after `cursor` (an ISO time), oldest first. */
  since: (cursor: string) => c.find({ at: { $gte: cursor } }, { sort: { at: 1 }, limit: 200 }),
  newest: async () => (await c.find({}, { sort: { at: -1 }, limit: 1 }))[0] ?? null,
});
