// server/utils/origin.ts
// Safe public origin for transactional links (emails, push deep links) — SERVER ONLY.
//
// When a member acts FROM their community's own domain, the link we send them
// should land back on that domain rather than on the generic app host. So the
// base URL is derived from the request Host.
//
// But Host is attacker-controllable, and planting an arbitrary domain into an
// email or a push notification is a phishing / open-redirect vector. So we only
// trust a host we actually serve: the configured app host, the platform main
// domain, or a host that EXACTLY matches an org's VERIFIED custom_domain.
// Anything else falls back to the configured appUrl.
//
// This deliberately does NOT reuse host-resolver.ts. That module is the tenant
// resolver: it is allowed to grow lenient matching (fallbacks, aliases, draft
// orgs) because its job is "serve the right community". A trust check must never
// inherit that leniency by accident — the guard exact-matches, has no fallback
// path, and requires domain_verified, which is precisely our proof that the org
// controls the domain. Keep the two apart even though they look similar.
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";
import { isLocalHost, normalizeHost } from "#core/shared/domains/host";

/** Known-host answers are booleans about rows that change ~never. Its own tiny
 *  cache, separate from the tenant resolver's (see the note above). */
const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
const known = new Map<string, { ok: boolean; expires: number }>();

/** The app's own configured host (from APP_URL), normalized. */
function appHost(appUrl: string): string {
  try {
    return normalizeHost(new URL(appUrl).host);
  } catch {
    return "";
  }
}

/**
 * Is this a host we actually serve? Exact matches only — the app host, the
 * platform main domain (and its www form), localhost, or a verified
 * custom_domain. No wildcard subdomains, no fallback org, so a spoofed Host
 * cannot masquerade as known.
 */
async function isKnownHost(rawHost: string, appUrl: string): Promise<boolean> {
  const host = normalizeHost(rawHost);
  if (!host) return false;
  if (isLocalHost(host)) return true;

  const config = useRuntimeConfig();
  const main = normalizeHost(config.public.mainDomain as string | undefined);
  if (host === appHost(appUrl)) return true;
  if (main && (host === main || host === `www.${main}`)) return true;

  const hit = known.get(host);
  if (hit && hit.expires > Date.now()) return hit.ok;
  known.delete(host);

  let ok = false;
  try {
    const directus = getTypedDirectus();
    // EXACT match on the host as given. No www pairing: if an org connected
    // `example.com`, a link built for `www.example.com` should fall back to the
    // app host rather than guess at a domain form we never verified.
    const rows = (await directus.request(
      readItems("hoa_organizations", {
        filter: { custom_domain: { _eq: host }, domain_verified: { _eq: true } },
        fields: ["id"],
        limit: 1,
      })
    )) as Array<{ id: string }>;
    ok = rows.length > 0;
  } catch {
    // Can't confirm — refuse to trust it. Falling back to appUrl is always safe.
    return false;
  }

  if (known.size >= MAX_ENTRIES) {
    const oldest = known.keys().next().value;
    if (oldest !== undefined) known.delete(oldest);
  }
  known.set(host, { ok, expires: Date.now() + TTL_MS });
  return ok;
}

/**
 * The base URL (scheme://host) for a link we send to a user, derived from the
 * request they initiated — so an action started on a community's custom domain
 * links back to that domain. Falls back to appUrl for any unrecognized (or
 * spoofed) host. Never returns a trailing slash.
 */
export async function safeRequestOrigin(event: H3Event): Promise<string> {
  const config = useRuntimeConfig();
  const fallback = String(config.public.appUrl || "").replace(/\/$/, "");
  const host = getRequestHost(event, { xForwardedHost: true });
  if (!host) return fallback;
  if (!(await isKnownHost(host, fallback))) return fallback;
  const clean = normalizeHost(host);
  // A link that lands in someone's inbox is always https on a real domain; only
  // local dev is http. Don't trust the request/proxy protocol for this.
  return `${isLocalHost(clean) ? "http" : "https"}://${host}`.replace(/\/$/, "");
}

/** Test seam / manual reset for the known-host cache. */
export function invalidateKnownHost(host?: string | null): void {
  if (host == null) known.clear();
  else known.delete(normalizeHost(host));
}
