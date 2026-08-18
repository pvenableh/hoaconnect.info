/**
 * Pure host/domain logic — no Directus, no H3, no runtime config.
 *
 * Tenancy in HOA Connect is a function of the request Host. Everything about
 * that function which doesn't need a database lives here so it can be unit
 * tested directly: normalization, platform-host detection, the candidate set we
 * match a custom domain against, and picking the best org out of a result set.
 *
 * The server-side wrapper (core/server/utils/host-resolver.ts) adds the Directus
 * query and the short-TTL cache; the spoof guard (core/server/utils/origin.ts)
 * reuses the normalization here but deliberately does its OWN exact-match
 * lookup — see that file for why the two must not share a resolver.
 */

/** Strip protocol, path, port, and a trailing dot; lowercase. */
export function normalizeHost(input?: string | null): string {
  if (!input) return "";
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0] ?? "";
  d = d.replace(/:\d+$/, "");
  d = d.replace(/\.$/, "");
  return d;
}

/** Loopback / dev hosts. Always "ours", never a tenant. */
export function isLocalHost(host?: string | null): boolean {
  const h = normalizeHost(host);
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
}

/**
 * Is this host one of our own app/platform domains rather than a customer's?
 * The main domain, its www form, and any *.maindomain subdomain are ours.
 *
 * An empty host is treated as ours: it means we couldn't read a Host header, and
 * failing closed (treating it as a tenant domain) would strand the request.
 */
export function isPlatformHost(rawHost?: string | null, mainDomain?: string | null): boolean {
  const h = normalizeHost(rawHost);
  const md = normalizeHost(mainDomain);
  if (!h) return true;
  if (isLocalHost(h)) return true;
  if (!md) return false;
  return h === md || h === `www.${md}` || h.endsWith(`.${md}`);
}

/**
 * Is this the platform's marketing host — the apex of our own domain?
 *
 * The marketing site and the app are one deployment (the WeddingConnect model):
 * `hoaconnect.info` serves the public marketing pages, `app.hoaconnect.info`
 * and the per-org subdomains serve the product. So "marketing host" is simply
 * the main domain's apex plus its www form — deriving it from `mainDomain`
 * rather than a second env var keeps the two from ever disagreeing.
 *
 * Note this is a SUBSET of `isPlatformHost`: every marketing host is one of
 * ours, but not every host of ours is the marketing host.
 */
export function isMarketingHost(rawHost?: string | null, mainDomain?: string | null): boolean {
  const h = normalizeHost(rawHost);
  const md = normalizeHost(mainDomain);
  if (!h || !md) return false;
  return h === md || h === `www.${md}`;
}

/**
 * The set of stored `custom_domain` values that should match this host, so an
 * org saved as `example.com` is reachable at `www.example.com` and vice versa.
 * Order is not significance — `pickOrgForHost` decides the winner.
 */
export function hostCandidates(rawHost?: string | null): string[] {
  const d = normalizeHost(rawHost);
  if (!d) return [];
  const bare = d.replace(/^www\./, "");
  return Array.from(new Set([d, bare, `www.${bare}`]));
}

/** Apex (registrable root, e.g. example.com) vs a subdomain (portal.example.com). */
export function classifyDomain(domain?: string | null): "apex" | "subdomain" {
  const d = normalizeHost(domain);
  // Heuristic: 2 labels = apex (example.com); 3+ = subdomain. Good enough for
  // the common ccTLD/gTLD cases; the UI shows instructions for both anyway.
  return d.split(".").length <= 2 ? "apex" : "subdomain";
}

/** DNS TXT record name we ask owners to add for verification. */
export function verificationRecordName(domain?: string | null): string {
  return `_hoaconnect.${normalizeHost(domain)}`;
}

export interface HostMatchable {
  id: string;
  slug: string;
  name?: string | null;
  custom_domain?: string | null;
}

/**
 * Pick the org that owns this host out of a candidate-matched result set.
 *
 * An exact host match always beats a www-variant match, so an org that stored
 * `www.example.com` can't steal a request for a *different* org holding the bare
 * `example.com` (and vice versa) just because both came back from the same
 * `_in` query. Returns null when nothing matches.
 */
export function pickOrgForHost<T extends HostMatchable>(rawHost: string | null | undefined, rows: T[]): T | null {
  const h = normalizeHost(rawHost);
  if (!h || !rows?.length) return null;
  const bare = h.replace(/^www\./, "");
  const exact = rows.find((r) => normalizeHost(r.custom_domain) === h);
  if (exact) return exact;
  return (
    rows.find((r) => {
      const d = normalizeHost(r.custom_domain);
      return !!d && d.replace(/^www\./, "") === bare;
    }) ?? null
  );
}
