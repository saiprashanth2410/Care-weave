import type { Collection, IndexSpec } from './store.js';

// One document per limiter key: { key, count, resetAt }. MongoDB deletes a document once its window has ended.
export const rateLimitsIndexes: IndexSpec[] = [{ keys: { key: 1 }, unique: true }, { keys: { resetAt: 1 }, expireAfterSeconds: 0 }];

export const rateLimitsRepo = (c: Collection) => ({
  hit: (key: string, windowMs: number) => c.hit(key, windowMs),
});
