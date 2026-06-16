// POST /api/email/sender/verify  { organizationId }
// Asks SendGrid to validate the org's domain DNS, then stores the result.
import { readItem, updateItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const { organizationId } = (await readBody(event)) || {};
  if (!organizationId) {
    throw createError({ statusCode: 400, message: "organizationId is required" });
  }

  const access = await checkAdminAccess(event, organizationId);
  if (!access.isAdmin) {
    throw createError({ statusCode: 403, message: "Admin access required" });
  }

  const directus = getTypedDirectus();
  const org = (await directus.request(
    readItem("hoa_organizations", organizationId, {
      fields: ["id", { settings: ["id", "email_domain_id", "email_domain"] }],
    })
  )) as { settings?: { id: string; email_domain_id?: string | null; email_domain?: string | null } | null };

  const settings = org?.settings;
  if (!settings?.id || !settings.email_domain_id) {
    throw createError({ statusCode: 400, message: "No sending domain to verify. Authenticate one first." });
  }

  const result = await validateDomainAuthentication(settings.email_domain_id);
  // Pull fresh per-record validity so the UI can show which CNAME is missing.
  const fresh = await getDomainAuthentication(settings.email_domain_id);
  const dns = toDnsRecords(fresh.dns);

  await directus.request(
    updateItem("block_settings", settings.id, {
      email_domain_verified: !!result.valid,
      email_domain_dns: dns,
    })
  );

  return {
    verified: !!result.valid,
    domain: settings.email_domain,
    dns,
    message: result.valid
      ? "Domain verified — you can now send from this domain."
      : "Not all DNS records are live yet. They can take a few minutes to propagate.",
  };
});
