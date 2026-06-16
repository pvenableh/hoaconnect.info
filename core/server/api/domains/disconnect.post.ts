// POST /api/domains/disconnect  { organizationId }
// Remove a custom domain from an org (admin only).
import { updateItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { organizationId } = body || {};
  if (!organizationId) {
    throw createError({ statusCode: 400, message: "organizationId is required" });
  }

  const access = await checkAdminAccess(event, organizationId);
  if (!access.isAdmin) {
    throw createError({ statusCode: 403, message: "Admin access required" });
  }

  const directus = getTypedDirectus();
  await directus.request(
    updateItem("hoa_organizations", organizationId, {
      custom_domain: null,
      domain_verified: false,
      domain_type: null,
      domain_config: null as any,
    })
  );

  return { success: true };
});
