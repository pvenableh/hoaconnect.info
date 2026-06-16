// server/utils/domains.ts
// Custom / APEX domain helpers: host normalization, main-domain detection, and
// resolving a verified custom domain → its organization. Backed by the existing
// hoa_organizations fields (custom_domain, domain_verified, domain_type,
// domain_config). The verification token lives in domain_config (JSON), so no
// schema migration is needed.
import { readItems } from "@directus/sdk";

export interface ResolvedDomainOrg {
  id: string;
  slug: string;
  name: string | null;
}

/** Strip protocol, path, port, and a trailing dot; lowercase. */
export function normalizeDomain(input?: string | null): string {
  if (!input) return "";
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0] ?? "";
  d = d.replace(/:\d+$/, "");
  d = d.replace(/\.$/, "");
  return d;
}

/** Is this host one of our own app/main domains (not a customer domain)? */
export function isMainDomainHost(rawHost: string | undefined, mainDomain?: string | null): boolean {
  const h = normalizeDomain(rawHost);
  const md = normalizeDomain(mainDomain);
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (!md) return false;
  // main domain, www, and any *.maindomain subdomain (slug-based hosting) are "ours"
  return h === md || h === `www.${md}` || h.endsWith(`.${md}`);
}

/** Apex (registrable root, e.g. example.com) vs a subdomain (portal.example.com). */
export function classifyDomain(domain: string): "apex" | "subdomain" {
  const d = normalizeDomain(domain);
  // Heuristic: 2 labels = apex (example.com); 3+ = subdomain. Good enough for
  // the common ccTLD/gTLD cases; the UI shows instructions for both anyway.
  return d.split(".").length <= 2 ? "apex" : "subdomain";
}

/**
 * Resolve a verified custom domain → org. Matches the domain as given and with a
 * leading www. stripped/added so either form works.
 */
export async function resolveOrgByDomain(
  directus: ReturnType<typeof getTypedDirectus>,
  host?: string | null
): Promise<ResolvedDomainOrg | null> {
  const d = normalizeDomain(host);
  if (!d) return null;
  const candidates = Array.from(new Set([d, d.replace(/^www\./, ""), `www.${d.replace(/^www\./, "")}`]));

  try {
    const rows = (await directus.request(
      readItems("hoa_organizations", {
        filter: {
          custom_domain: { _in: candidates },
          domain_verified: { _eq: true },
          status: { _in: ["active", "inactive"] },
        },
        fields: ["id", "slug", "name", "custom_domain"],
        limit: 1,
      })
    )) as Array<{ id: string; slug: string; name: string | null }>;
    return rows[0] || null;
  } catch {
    return null;
  }
}

/** DNS TXT record name we ask owners to add for verification. */
export function verificationRecordName(domain: string): string {
  return `_hoaconnect.${normalizeDomain(domain)}`;
}
