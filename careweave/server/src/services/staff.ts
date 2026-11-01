import type { Repos } from '../repo/index.js';
import { buildSeed } from '../seed.js';

/** Makes sure the staff directory has every seeded account and the permissions the seed declares. */
export async function ensureStaff(repos: Repos) {
  for (const seed of (await buildSeed()).users) {
    const existing = await repos.users.byEmail(seed.email);
    if (!existing) await repos.users.insert(seed);
    else if (JSON.stringify(existing.permissions || []) !== JSON.stringify((seed as any).permissions || [])) {
      await repos.users.update(existing, { permissions: (seed as any).permissions || [] });
    }
  }
}
