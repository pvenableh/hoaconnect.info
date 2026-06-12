// POST /api/domains/connect  { organizationId, domain }
// An org admin claims a custom domain. Stores it unverified with a verification
// token in domain_config, and returns the DNS instructions to show the owner.
import { readItems, updateItem } from "@directus/sdk";
import { randomUUID } from "node:crypto";
import { normalizeDomain, classifyDomain, isMainDomainHost, verificationRecordName } from "../../utils/domains";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { organizationId, domain: rawDomain } = body || {};
  if (!organizationId || !rawDomain) {
    throw createError({ statusCode: 400, message: "organizationId and domain are required" });
  }

  // Authorization: caller must be an admin of this org
  const access = await checkAdminAccess(event, organizationId);
  if (!access.isAdmin) {
    throw createError({ statusCode: 403, message: "Admin access required" });
  }

  const config = useRuntimeConfig();
  const domain = normalizeDomain(rawDomain);

  // Basic validity + can't claim our own/app domains
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    throw createError({ statusCode: 400, message: "Enter a valid domain, e.g. yourbuilding.com" });
  }
  if (isMainDomainHost(domain, config.public.mainDomain as string)) {
    throw createError({ statusCode: 400, message: "That domain belongs to the platform" });
  }

  const directus = getTypedDirectus();

  // Domain must not already be claimed by a different org
  const existing = (await directus.request(
    readItems("hoa_organizations", {
      filter: { custom_domain: { _eq: domain } },
      fields: ["id"],
      limit: 1,
    })
  )) as Array<{ id: string }>;
  if (existing[0] && existing[0].id !== organizationId) {
    throw createError({ statusCode: 409, message: "That domain is already connected to another community" });
  }

  const token = randomUUID().replace(/-/g, "");
  const domainType = classifyDomain(domain);
  const domainConfig = {
    verification_token: token,
    status: "pending",
    record_type: "TXT",
    record_name: verificationRecordName(domain),
    record_value: `hoaconnect-verify=${token}`,
    connected_at: new Date().toISOString(),
    verified_at: null as string | null,
  };

  await directus.request(
    updateItem("hoa_organizations", organizationId, {
      custom_domain: domain,
      domain_verified: false,
      domain_type: domainType,
      domain_config: domainConfig as any,
    })
  );

  return {
    success: true,
    domain,
    domainType,
    verification: { name: domainConfig.record_name, type: "TXT", value: domainConfig.record_value },
  };
});
