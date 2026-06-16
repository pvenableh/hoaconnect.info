// POST /api/email/sender/authenticate  { organizationId, domain }
// Creates a SendGrid domain authentication for the org and stores the CNAME
// records to display. The org adds them to DNS, then calls verify.
import { updateItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const { organizationId, domain } = (await readBody(event)) || {};
  if (!organizationId || !domain) {
    throw createError({ statusCode: 400, message: "organizationId and domain are required" });
  }

  const access = await checkAdminAccess(event, organizationId);
  if (!access.isAdmin) {
    throw createError({ statusCode: 403, message: "Admin access required" });
  }

  // Normalize: strip scheme/path/leading www; basic shape check.
  const cleanDomain = String(domain)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleanDomain)) {
    throw createError({ statusCode: 400, message: "Enter a valid domain (e.g. yourbuilding.com)" });
  }

  const directus = getTypedDirectus();
  const settingsId = await getOrCreateOrgSettingsId(organizationId);

  const auth = await createDomainAuthentication(cleanDomain);
  const dns = toDnsRecords(auth.dns);

  await directus.request(
    updateItem("block_settings", settingsId, {
      email_domain: cleanDomain,
      email_domain_id: String(auth.id),
      email_domain_verified: !!auth.valid,
      email_domain_dns: dns,
    })
  );

  return { domain: cleanDomain, id: String(auth.id), verified: !!auth.valid, dns };
});
