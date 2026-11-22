import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';
import type { InboxItem } from './types.js';

// Messages to the administrator: { id, kind: 'help' | 'issue', fromEmail, fromName, fromRole, subject, message, status, createdAt, ... }.
export const inboxIndexes: IndexSpec[] = [idIndex, { keys: { status: 1, createdAt: -1 } }, { keys: { fromEmail: 1, status: 1 } }];

export const inboxRepo = (c: Collection<InboxItem>) => ({
  ...baseRepo(c),
  newestFirst: (filter: Record<string, any> = {}, limit = 100) => c.find(filter, { sort: { createdAt: -1 }, limit }),
});
