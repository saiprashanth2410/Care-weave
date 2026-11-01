import type { Collection, IndexSpec } from './store.js';

// One document per sign-in: { tokenHash, userId, expiresAt }. Only the SHA-256 of the token is stored. MongoDB removes the
// document itself once expiresAt has passed (TTL index); the read also checks expiresAt, because the TTL sweep runs only about
// once a minute. In the development fallback these live in process memory and are never written to the JSON file.
export const sessionsIndexes: IndexSpec[] = [{ keys: { tokenHash: 1 }, unique: true }, { keys: { expiresAt: 1 }, expireAfterSeconds: 0 }];

export const sessionsRepo = (c: Collection) => ({
  create: (tokenHash: string, userId: string, expiresAt: Date) => c.insert({ tokenHash, userId, expiresAt }),
  async find(tokenHash: string) {
    const s = await c.findOne({ tokenHash });
    return s && new Date(s.expiresAt).getTime() > Date.now() ? s : null;
  },
  remove: (tokenHash: string) => c.remove({ tokenHash }),
});
