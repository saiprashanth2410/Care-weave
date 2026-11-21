/**
 * The network helpers a video call needs to find a path between two browsers.
 *  - STUN (always): lets each browser learn its public address. Enough when both sides have simple home or mobile networks.
 *  - TURN (when configured): a relay that carries the call, still end-to-end encrypted, when no direct path exists. This is what makes a
 *    call work between different countries or behind strict college and hospital firewalls.
 * TURN credentials live here on the server, not in the web page build, so they can be changed with an environment variable and no rebuild.
 * Two ways to configure one:
 *   METERED_DOMAIN + METERED_API_KEY   a free account at metered.ca: short-lived credentials are fetched for each call
 *   TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL   any TURN server (comma-separated urls)
 */
export type IceServer = { urls: string[]; username?: string; credential?: string };

const STUN: IceServer = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };
const HOST = /^[a-z0-9]([a-z0-9.-]{0,120}[a-z0-9])?$/i;
const CACHE_MS = 5 * 60_000;
let cache: { at: number; servers: IceServer[] } | null = null;

export const forgetIceServers = () => { cache = null; };

async function fromMetered(domain: string, apiKey: string): Promise<IceServer[]> {
  if (!HOST.test(domain)) return [];
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.servers;
  try {
    const res = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return cache?.servers ?? [];
    const rows = (await res.json()) as any[];
    const servers = (Array.isArray(rows) ? rows : [])
      .map((r) => ({ urls: ([] as string[]).concat(r?.urls ?? r?.url ?? []).filter((u) => typeof u === 'string' && /^(stun|turn|turns):/.test(u)), username: r?.username, credential: r?.credential }))
      .filter((r) => r.urls.length);
    cache = { at: Date.now(), servers };
    return servers;
  } catch {
    return cache?.servers ?? [];
  }
}

export async function iceServers(): Promise<{ iceServers: IceServer[]; relay: boolean }> {
  const env = process.env;
  let extra: IceServer[] = [];
  if (env.METERED_DOMAIN && env.METERED_API_KEY) extra = await fromMetered(env.METERED_DOMAIN.trim(), env.METERED_API_KEY.trim());
  else if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    extra = [{ urls: env.TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }];
  }
  const relay = extra.some((s) => s.urls.some((u) => /^turns?:/.test(u)));
  return { iceServers: [STUN, ...extra.filter((s) => !s.urls.every((u) => u.startsWith('stun:')))], relay };
}
