import crypto from 'node:crypto';
import { INDEXES, type Repos } from '../repo/index.js';
import { DEMO_ACCOUNTS, buildSeed } from '../seed.js';

// Setting up a database (indexes, one-off data fixes, the staff directory) is the same work every time. On a serverless host
// every cold start used to repeat it, about 60 round trips, which is most of the twenty seconds a first request could take.
// A stamp saved in the database says "this has been done for this version of the code"; while it matches, a cold start
// skips all of it. Change the indexes or the seeded staff and the stamp changes, so the work runs once more.
const ID = 'startup';

/** Bump to force the set-up to run again on the next start. */
export const STARTUP_VERSION = 1;

export async function startupStamp(): Promise<string> {
  const seed = (await buildSeed()).users.map((u) => [u.email, u.role, u.permissions ?? []]);
  return crypto.createHash('sha1').update(JSON.stringify([STARTUP_VERSION, INDEXES, seed, DEMO_ACCOUNTS])).digest('hex');
}

export async function readStartupStamp(repos: Repos): Promise<string | undefined> {
  return (await repos.meta.byId(ID))?.stamp;
}

export async function writeStartupStamp(repos: Repos, stamp: string) {
  const current = await repos.meta.byId(ID);
  if (!current) await repos.meta.insert({ id: ID, stamp, at: new Date().toISOString() });
  else await repos.meta.update(current, { stamp, at: new Date().toISOString() });
}
