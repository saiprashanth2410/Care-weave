import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const usersIndexes: IndexSpec[] = [idIndex, { keys: { email: 1 } }, { keys: { role: 1 } }];

export const usersRepo = (c: Collection) => ({
  ...baseRepo(c),
  byEmail: (email: string) => c.findOne({ email: email.trim().toLowerCase() }),
  byRole: (role: string) => c.find({ role }),
});
