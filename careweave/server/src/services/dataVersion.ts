import crypto from 'node:crypto';
import { ConflictError, DuplicateError, type Repos } from '../repo/index.js';

// A token that changes whenever data is saved through the API. Screens ask for it (one small read) instead of reloading their
// lists every few seconds, and reload only when it has moved. It is stored in the database, so every server instance sees
// the same token. It is written before the response is sent: a serverless function may be frozen the moment it has answered,
// so a write left until afterwards could be lost.
const ID = 'data-version';

export async function bumpDataVersion(repos: Repos) {
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const current = await repos.meta.byId(ID);
      if (!current) await repos.meta.insert({ id: ID, token });
      else await repos.meta.update(current, { token });
      return;
    } catch (err) {
      // Another request saved at the same moment and changed the token itself, which is all a screen needs to know.
      if (err instanceof ConflictError) return;
      if (!(err instanceof DuplicateError)) throw err; // two first writers: read again and update
    }
  }
}

export async function readDataVersion(repos: Repos): Promise<string> {
  return (await repos.meta.byId(ID))?.token ?? '';
}

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** After a successful save through the API, change the token before the response goes out. */
export function markDataChanges(getRepos: () => Repos) {
  return (req: any, res: any, next: any) => {
    // Signing in and out does not change anything a list shows.
    // The video call's setup messages (several per second) change nothing a list shows; starting and ending a consult do, and still count.
    if (READS.has(req.method) || req.path.startsWith('/auth/') || req.path === '/health' || req.path.startsWith('/video/public/')) return next();
    const end = res.end.bind(res);
    res.end = (...args: any[]) => {
      res.end = end;
      if (res.statusCode >= 400) return end(...args);
      bumpDataVersion(getRepos())
        .catch((err) => console.warn('Could not update the data version:', err?.message))
        .finally(() => end(...args));
      return res;
    };
    next();
  };
}
