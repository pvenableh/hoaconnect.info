// server/api/landing/view.post.ts
// Fire-and-forget page-view beacon from the public landing (once per session,
// client-side). Increments the org's landing_stats.views. Public, best-effort.
import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  const slug = body?.slug as string | undefined;
  if (!slug) return { ok: false };
  try {
    const directus = getTypedDirectus();
    const orgs = await directus.request(
      readItems("hoa_organizations", {
        filter: { slug: { _eq: slug } },
        fields: ["id"],
        limit: 1,
      })
    );
    const id = orgs?.[0]?.id;
    if (!id) return { ok: false };
    await bumpLandingStat(id, "views", directus);
  } catch {
    /* best-effort */
  }
  return { ok: true };
});
