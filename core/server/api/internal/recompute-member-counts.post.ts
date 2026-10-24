// server/api/internal/recompute-member-counts.post.ts
// Nightly safety net: recompute member_count for every org, catching drift from
// members edited directly in the Directus admin (the app paths already recompute
// on change). Authorized via the cron secret or a signed-in App Administrator
// (`requireCronOrAppAdmin`) — it touches every org.
import { readItems } from "@directus/sdk";
import { requireCronOrAppAdmin } from "../../utils/cron-auth";

export default defineEventHandler(async (event) => {
  await requireCronOrAppAdmin(event);

  const directus = getTypedDirectus();
  const orgs = await directus.request(
    readItems("hoa_organizations", { fields: ["id"], limit: -1 })
  );
  let updated = 0;
  for (const o of orgs as any[]) {
    const n = await recomputeMemberCount(o.id, directus);
    if (n !== null) updated++;
  }
  return { ok: true, organizations: (orgs as any[]).length, updated };
});
