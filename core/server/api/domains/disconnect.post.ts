// POST /api/domains/disconnect  { organizationId }
// Remove a custom domain from an org (admin only).
import { readItem, updateItem } from "@directus/sdk";
import { invalidateHostCache } from "../../utils/host-resolver";

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
  // Read the domain before we null it — it's the cache key we need to drop.
  const existing = (await directus
    .request(readItem("hoa_organizations", organizationId, { fields: ["custom_domain"] }))
    .catch(() => null)) as { custom_domain?: string | null } | null;

  await directus.request(
    updateItem("hoa_organizations", organizationId, {
      custom_domain: null,
      domain_verified: false,
      domain_type: null,
      domain_config: null as any,
    })
  );

  if (existing?.custom_domain) invalidateHostCache(existing.custom_domain);

  return { success: true };
});
