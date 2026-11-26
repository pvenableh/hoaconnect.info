// GET /api/email/blocks — the block-builder's library for an org: every platform
// (is_system) block plus the org's own blocks, grouped by category for the
// sidebar. Auth-gated to comms actors; org-scoped so one org never sees another's
// custom blocks. (Phase 6 — docs/plan-earnest-parity-upgrade.md.)

import { readItems } from "@directus/sdk";
import type { HoaNewsletterBlock } from "#core/types/directus";
import { blockLibrarySpec } from "#core/server/utils/email-block-reads";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  // The library and the caller's standing as ONE request (access-snapshot.ts);
  // the compose check answers from that standing and refuses before any row
  // is used. A failed batch checks and reads one by one as before.
  const batched = await batchWithAccessSnapshot(event, orgId, { blocks: blockLibrarySpec(orgId) }).catch(() => null);
  await requireOrgComposeAccess(event, orgId);

  let rows: HoaNewsletterBlock[];
  if (batched) rows = (batched.blocks ?? []) as HoaNewsletterBlock[];
  else {
    const { collection, ...query } = blockLibrarySpec(orgId);
    rows = (await getTypedDirectus().request(readItems(collection as "hoa_newsletter_blocks", query as any))) as unknown as HoaNewsletterBlock[];
  }

  // Group by category for the sidebar palette.
  const library: Record<string, HoaNewsletterBlock[]> = {};
  for (const b of rows) {
    const cat = (b.category as string) || "other";
    (library[cat] ||= []).push(b);
  }

  return { blocks: rows, library };
});
