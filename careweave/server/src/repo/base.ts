import type { Collection, Filter, FindOpts, IndexSpec } from './store.js';

/** What every collection offers; each module adds the queries its callers need. */
export function baseRepo(c: Collection) {
  return {
    find: (filter?: Filter, opts?: FindOpts) => c.find(filter, opts),
    findOne: (filter: Filter) => c.findOne(filter),
    byId: (id: string) => c.findOne({ id }),
    count: (filter?: Filter) => c.count(filter),
    insert: (doc: any) => c.insert(doc),
    insertMany: (docs: any[]) => c.insertMany(docs),
    update: (current: any, changes: Filter, expected?: number) => c.update(current, changes, expected),
    remove: (filter: Filter) => c.remove(filter),
  };
}

export const idIndex: IndexSpec = { keys: { id: 1 }, unique: true };

/** Matches a whole string, ignoring case, with user text taken literally. */
export const exactCI = (s: string) => ({ $regex: `^${escapeRegex(s)}$`, $options: 'i' });
export const containsCI = (s: string) => ({ $regex: escapeRegex(s), $options: 'i' });
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a phone number written with any spaces, dashes or +91 prefix: the same digits in the same order. */
export const phoneLike = (digits: string) => ({ $regex: digits.split('').join('\\D*') + '\\D*$' });
