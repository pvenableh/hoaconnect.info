// server/utils/domains.ts
// Custom / APEX domain helpers, backed by the existing hoa_organizations fields
// (custom_domain, domain_verified, domain_type, domain_config). The verification
// token lives in domain_config (JSON), so no schema migration is needed.
//
// The host-matching logic itself is pure and lives in #core/shared/domains/host
// so it can be unit tested; this module re-exports it under the names the
// domain-management endpoints already use. For resolving a request Host to an
// org, use `resolveOrgForHost` (host-resolver.ts) — it caches. `resolveOrgByDomain`
// below stays as the uncached primitive.
import {
  classifyDomain as classifyDomainPure,
  isPlatformHost,
  normalizeHost,
  verificationRecordName as verificationRecordNamePure,
} from "#core/shared/domains/host";
import { fetchOrgByHost, type ResolvedHostOrg } from "./host-resolver";

export type ResolvedDomainOrg = ResolvedHostOrg;

/** Strip protocol, path, port, and a trailing dot; lowercase. */
export const normalizeDomain = normalizeHost;

/** Is this host one of our own app/main domains (not a customer domain)? */
export function isMainDomainHost(rawHost: string | undefined, mainDomain?: string | null): boolean {
  return isPlatformHost(rawHost, mainDomain);
}

/** Apex (registrable root, e.g. example.com) vs a subdomain (portal.example.com). */
export const classifyDomain = classifyDomainPure;

/** DNS TXT record name we ask owners to add for verification. */
export const verificationRecordName = verificationRecordNamePure;

/**
 * Resolve a verified custom domain → org, uncached. Matches the domain as given
 * and with a leading www. stripped/added so either form works.
 *
 * The `directus` parameter is accepted for call-site compatibility and ignored:
 * the lookup always uses the admin client, as it always did.
 */
export async function resolveOrgByDomain(
  _directus: unknown,
  host?: string | null
): Promise<ResolvedDomainOrg | null> {
  return fetchOrgByHost(host);
}
