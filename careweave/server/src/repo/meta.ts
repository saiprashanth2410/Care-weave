import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

// Small shared state that belongs to no record: { id, ...fields }. For example when the analytics sync last ran and who holds its lock.
export const metaIndexes: IndexSpec[] = [idIndex];

export const metaRepo = (c: Collection) => baseRepo(c);
