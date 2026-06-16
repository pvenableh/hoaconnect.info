// server/api/internal/recompute-member-counts.post.ts
// Nightly safety net: recompute member_count for every org, catching drift from
// members edited directly in the Directus admin (the app paths already recompute
// on change). Authorized via x-cron-secret (matching the scheduled-email flow)
// or an authenticated session.
import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET;
  const provided = getHeader(event, "x-cron-secret");
  let authorized = !!secret && !!provided && provided === secret;
  if (!authorized) {
    try {
      await requireUserSession(event);
      authorized = true;
    } catch {
      /* no session */
    }
  }
  if (!authorized) throw createError({ statusCode: 401, message: "Unauthorized" });

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
