// POST /api/email/sender/settings  { organizationId, fromName?, fromEmail? }
// Saves the display name (always allowed) and from-address (only when it's on
// the org's verified sending domain).
import { readItem, updateItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const { organizationId, fromName, fromEmail } = (await readBody(event)) || {};
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
      fields: ["id", { settings: ["id", "email_domain", "email_domain_verified"] }],
    })
  )) as {
    settings?: { id: string; email_domain?: string | null; email_domain_verified?: boolean | null } | null;
  };

  const settingsId = org?.settings?.id || (await getOrCreateOrgSettingsId(organizationId));

  const patch: Record<string, any> = { from_name: (fromName ?? "").trim() || null };

  if (fromEmail !== undefined) {
    const addr = String(fromEmail || "").trim().toLowerCase();
    if (addr) {
      const verified = !!org?.settings?.email_domain_verified;
      const domain = (org?.settings?.email_domain || "").toLowerCase();
      if (!verified || !domain) {
        throw createError({ statusCode: 400, message: "Verify a sending domain before setting a from-address." });
      }
      if (!/^[^\s@]+@[^\s@]+$/.test(addr) || addr.split("@")[1] !== domain) {
        throw createError({ statusCode: 400, message: `From-address must be on your verified domain (@${domain}).` });
      }
      patch.from_email = addr;
    } else {
      patch.from_email = null;
    }
  }

  await directus.request(updateItem("block_settings", settingsId, patch));
  return { success: true, fromName: patch.from_name, fromEmail: patch.from_email ?? null };
});
