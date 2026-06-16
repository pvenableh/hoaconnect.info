// POST /api/email/sender/disconnect  { organizationId }
// Removes the org's SendGrid domain authentication and clears the sender domain
// (org reverts to the shared platform from-address; display name is kept).
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
      fields: ["id", { settings: ["id", "email_domain_id"] }],
    })
  )) as { settings?: { id: string; email_domain_id?: string | null } | null };

  const settings = org?.settings;
  if (settings?.email_domain_id) {
    try {
      await deleteDomainAuthentication(settings.email_domain_id);
    } catch (e: any) {
      // Already gone on SendGrid's side is fine — keep clearing our fields.
      console.warn(`[email/sender] SendGrid delete failed (continuing): ${e?.message || e}`);
    }
  }

  if (settings?.id) {
    await directus.request(
      updateItem("block_settings", settings.id, {
        email_domain: null,
        email_domain_id: null,
        email_domain_verified: false,
        email_domain_dns: null,
        from_email: null,
      })
    );
  }

  return { success: true };
});
