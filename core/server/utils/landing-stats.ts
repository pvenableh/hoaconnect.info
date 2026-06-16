// server/utils/landing-stats.ts
// Tiny best-effort counter for public-landing insights, stored on
// hoa_organizations.landing_stats ({ views, inquiries }). Kept off the
// admin-edited block_settings.landing so concurrent view writes never clobber
// the landing config. Approximate by design (read-modify-write); never throws.
import { readItem, updateItem } from "@directus/sdk";

export async function bumpLandingStat(
  organizationId: string,
  key: "views" | "inquiries",
  directus = getTypedDirectus()
): Promise<void> {
  if (!organizationId) return;
  try {
    const org: any = await directus.request(
      readItem("hoa_organizations", organizationId, { fields: ["landing_stats"] })
    );
    const stats =
      org?.landing_stats && typeof org.landing_stats === "object" ? { ...org.landing_stats } : {};
    stats[key] = (Number(stats[key]) || 0) + 1;
    await directus.request(
      updateItem("hoa_organizations", organizationId, { landing_stats: stats } as any)
    );
  } catch (e) {
    console.warn("[landing-stats] bump failed", e);
  }
}
