// GET /api/email/blocks — the block-builder's library for an org: every platform
// (is_system) block plus the org's own blocks, grouped by category for the
// sidebar. Auth-gated to comms actors; org-scoped so one org never sees another's
// custom blocks. (Phase 6 — docs/plan-earnest-parity-upgrade.md.)

import { readItems } from "@directus/sdk";
import type { HoaNewsletterBlock } from "#core/types/directus";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  await requireOrgComposeAccess(event, orgId);

  const directus = getTypedDirectus();
  const rows = (await directus.request(
    readItems("hoa_newsletter_blocks", {
      filter: {
        _or: [{ is_system: { _eq: true } }, { organization: { _eq: orgId } }],
      },
      fields: [
        "id", "name", "slug", "description", "category",
        "mjml_source", "variables_schema", "is_system", "sort",
      ],
      sort: ["category", "sort", "name"],
      limit: 200,
    })
  )) as HoaNewsletterBlock[];

  // Group by category for the sidebar palette.
  const library: Record<string, HoaNewsletterBlock[]> = {};
  for (const b of rows) {
    const cat = (b.category as string) || "other";
    (library[cat] ||= []).push(b);
  }

  return { blocks: rows, library };
});
