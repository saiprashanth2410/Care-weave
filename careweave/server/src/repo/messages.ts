import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';
import type { Message } from './types.js';

// Direct messages between staff. A conversation is the pair of people, so its id is their two user ids in sorted order.
// A photo is kept in its own collection so listing messages never loads image bytes.
export const messagesIndexes: IndexSpec[] = [idIndex, { keys: { convId: 1, at: -1 } }, { keys: { toId: 1, read: 1 } }, { keys: { fromId: 1, at: -1 } }];
export const messageImagesIndexes: IndexSpec[] = [idIndex];

export const convIdOf = (a: string, b: string) => [a, b].sort().join('|');

export const messagesRepo = (c: Collection<Message>) => ({
  ...baseRepo(c),
  /** Everything a person sent or received, newest first (the conversation list is built from this). */
  involving: (userId: string, limit = 1500) => c.find({ $or: [{ fromId: userId }, { toId: userId }] }, { sort: { at: -1 }, limit }),
  thread: (convId: string, limit = 100) => c.find({ convId }, { sort: { at: -1 }, limit }),
  unreadFor: (userId: string) => c.count({ toId: userId, read: false }),
});

export const messageImagesRepo = (c: Collection) => ({ ...baseRepo(c) });
