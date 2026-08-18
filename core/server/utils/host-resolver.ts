// server/utils/host-resolver.ts
// THE Host → org resolver. One place that answers "which community does this
// request belong to?", with a short-TTL cache in front of Directus.
//
// Why the cache: tenancy is resolved on essentially every request that arrives
// on a custom domain (middleware, by-domain, the PWA manifest, transactional
// link building), and each miss was a full Directus round-trip. Domain rows
// change roughly never, so a 60s TTL turns a per-request query into a per-minute
// one at zero correctness cost.
//
// Invalidation is BEST-EFFORT AND LOCAL. Nitro on Vercel runs many isolated
// instances; `invalidateHostCache()` clears the instance that served the write,
// not the fleet. The TTL is the real guarantee: a domain connect/verify/
// disconnect is live everywhere within TTL_MS. Don't build anything that needs
// invalidation to be immediate and global — it isn't.
import { readItems } from "@directus/sdk";
import { hostCandidates, normalizeHost, pickOrgForHost } from "#core/shared/domains/host";

export interface ResolvedHostOrg {
  id: string;
  slug: string;
  name: string | null;
}

/** Positive entries live a minute; a miss is re-checked sooner so a freshly
 *  verified domain starts serving quickly instead of 404-ing for a full TTL. */
const TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 15_000;
/** Bound the map: an unmatched Host header is attacker-supplied and would
 *  otherwise let anyone grow the negative cache without limit. */
const MAX_ENTRIES = 500;

interface CacheEntry {
  value: ResolvedHostOrg | null;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
/** In-flight lookups, so a burst on a cold instance makes ONE Directus call. */
const inflight = new Map<string, Promise<ResolvedHostOrg | null>>();

function readCache(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

function writeCache(key: string, value: ResolvedHostOrg | null): void {
  if (cache.size >= MAX_ENTRIES) {
    // Cheap eviction: drop the oldest insertion. Map preserves insertion order,
    // and every entry expires on its own anyway — this only caps memory.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + (value ? TTL_MS : NEGATIVE_TTL_MS) });
}

/**
 * The raw lookup. THROWS when Directus is unreachable, so callers can tell
 * "this host belongs to nobody" apart from "we couldn't find out" — the cache
 * depends on that distinction (a cached outage would keep custom domains dark
 * for a full negative TTL after Directus recovers).
 */
async function lookupOrgByHost(host: string): Promise<ResolvedHostOrg | null> {
  const candidates = hostCandidates(host);
  if (!candidates.length) return null;
  const directus = getTypedDirectus();
  const rows = (await directus.request(
    readItems("hoa_organizations", {
      filter: {
        custom_domain: { _in: candidates },
        domain_verified: { _eq: true },
        status: { _in: ["active", "inactive"] },
      },
      fields: ["id", "slug", "name", "custom_domain"],
      limit: 5,
    })
  )) as Array<{ id: string; slug: string; name: string | null; custom_domain: string | null }>;
  const match = pickOrgForHost(host, rows);
  return match ? { id: match.id, slug: match.slug, name: match.name ?? null } : null;
}

/** Uncached lookup: verified custom domain → org. Kept for the rare caller that
 *  must not read a cached answer (the Caddy cert gate); prefer `resolveOrgForHost`
 *  everywhere else. Returns null rather than throwing on a Directus failure. */
export async function fetchOrgByHost(host?: string | null): Promise<ResolvedHostOrg | null> {
  const key = normalizeHost(host);
  if (!key) return null;
  try {
    return await lookupOrgByHost(key);
  } catch {
    return null;
  }
}

/**
 * Resolve the org that owns this request Host, or null. Cached; safe to call
 * many times per request.
 */
export async function resolveOrgForHost(host?: string | null): Promise<ResolvedHostOrg | null> {
  const key = normalizeHost(host);
  if (!key) return null;

  const hit = readCache(key);
  if (hit) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = lookupOrgByHost(key)
    .then((value) => {
      writeCache(key, value);
      return value;
    })
    .catch(() => {
      // Directus unreachable. Behave like "no match" for THIS request rather
      // than 500-ing every page on a custom domain — but do NOT cache it, or
      // the outage would outlive itself by a full negative TTL.
      return null;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/**
 * Drop cached entries for a domain (and its www/bare twin) after a connect,
 * verify, or disconnect. Local to this instance — see the file header.
 * Called with no argument it clears everything (tests).
 */
export function invalidateHostCache(host?: string | null): void {
  if (host == null) {
    cache.clear();
    return;
  }
  for (const key of hostCandidates(host)) cache.delete(key);
}

/** Test seam: current cache size. */
export function hostCacheSize(): number {
  return cache.size;
}
