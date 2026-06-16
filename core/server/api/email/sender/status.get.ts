// GET /api/email/sender/status?organizationId=...
// Current white-label sender config for the org's composer settings UI.
import { readItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const organizationId = getQuery(event).organizationId as string | undefined;
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
      fields: [
        "id",
        "name",
        {
          settings: [
            "from_name",
            "from_email",
            "email_domain",
            "email_domain_verified",
            "email_domain_dns",
          ],
        },
      ],
    })
  )) as {
    name?: string | null;
    settings?: {
      from_name?: string | null;
      from_email?: string | null;
      email_domain?: string | null;
      email_domain_verified?: boolean | null;
      email_domain_dns?: Record<string, any> | null;
    } | null;
  };

  const s = org?.settings || {};
  return {
    orgName: org?.name || null,
    fromName: s.from_name || null,
    fromEmail: s.from_email || null,
    domain: s.email_domain || null,
    verified: !!s.email_domain_verified,
    dns: Array.isArray(s.email_domain_dns) ? s.email_domain_dns : [],
  };
});
