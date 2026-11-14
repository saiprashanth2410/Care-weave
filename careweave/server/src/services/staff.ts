import { ConflictError, DuplicateError, type Repos } from '../repo/index.js';
import { DEMO_ACCOUNTS, buildSeed } from '../seed.js';

const DELETED = 'deleted-staff';

/** Emails of seeded accounts an administrator deleted on purpose, so the start-up sync does not put them back. */
export async function deletedStaffEmails(repos: Repos): Promise<string[]> {
  return (await repos.meta.byId(DELETED))?.emails ?? [];
}

export async function rememberDeletedStaff(repos: Repos, email: string) {
  const current = await repos.meta.byId(DELETED);
  const emails = [...new Set([...(current?.emails ?? []), email.toLowerCase()])];
  try {
    if (!current) await repos.meta.insert({ id: DELETED, emails });
    else await repos.meta.update(current, { emails });
  } catch (err) {
    if (!(err instanceof ConflictError || err instanceof DuplicateError)) throw err;
  }
}

/** The shared demo accounts (published password). */
export const isDemoEmail = (email: string) => /@careweave\.test$/i.test(String(email || ''));

/** Makes sure the staff directory has every seeded account and the permissions the seed declares. */
export async function ensureStaff(repos: Repos, opts: { demo?: boolean } = {}) {
  const demo = opts.demo ?? DEMO_ACCOUNTS;
  const deleted = new Set(await deletedStaffEmails(repos));
  for (const seed of (await buildSeed()).users) {
    if (deleted.has(seed.email.toLowerCase())) continue;
    const existing = await repos.users.byEmail(seed.email);
    try {
      if (!existing) await repos.users.insert(seed);
      else if (!existing.managed && JSON.stringify(existing.permissions || []) !== JSON.stringify((seed as any).permissions || [])) {
        await repos.users.update(existing, { permissions: (seed as any).permissions || [] });
      }
    } catch (err) {
      // Another instance starting at the same moment did this same write first; the result is the same either way.
      if (!(err instanceof ConflictError || err instanceof DuplicateError)) throw err;
    }
  }

  // Where the demo accounts must not exist (production, Vercel), switch off any that an earlier version left in the directory.
  // Their password is published in the repository, so they must not be able to sign in, and they should not clutter the staff
  // list or the booking list. They are disabled, not deleted, so records that name them stay readable.
  if (!demo) {
    for (const u of await repos.users.find({ email: { $regex: '@careweave\\.test$', $options: 'i' } })) {
      if (!isDemoEmail(u.email) || u.active === false) continue;
      try {
        await repos.users.update(u, { active: false, disabledReason: 'Demo account: not for a deployed system' });
        await repos.sessions.removeForUser(u.id);
      } catch (err) {
        if (!(err instanceof ConflictError)) throw err;
      }
    }
  }
}
