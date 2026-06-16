/**
 * Return the org's block_settings row id, creating + linking one if absent.
 * Used by server routes that write settings (e.g. white-label email sender).
 */
import { readItem, createItem, updateItem } from "@directus/sdk";

export async function getOrCreateOrgSettingsId(organizationId: string): Promise<string> {
  const directus = getTypedDirectus();
  const org = (await directus.request(
    readItem("hoa_organizations", organizationId, { fields: ["id", { settings: ["id"] }] })
  )) as { settings?: { id: string } | string | null };

  const existing = typeof org?.settings === "object" ? org?.settings?.id : org?.settings;
  if (existing) return existing as string;

  const created = (await directus.request(
    createItem("block_settings", { organization: organizationId, status: "published" })
  )) as { id: string };
  await directus.request(updateItem("hoa_organizations", organizationId, { settings: created.id }));
  return created.id;
}
