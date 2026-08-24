// GET /api/ai/actions — the assistant's action feed for an org: proposals
// awaiting approval + the executed/rejected history. Org-scoped and gated to
// comms actors. Optional filters: status, and an entity (type+id) to scope to
// one record's actions. (Phase 4 — docs/plan-earnest-parity-upgrade.md.)

import { readItems } from "@directus/sdk";
import { parseActionPreview } from "#core/shared/ai/actions";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const q = getQuery(event);
  const orgId = String(q.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  await requireOrgComposeAccess(event, orgId);

  const filter: any = { organization: { _eq: orgId } };
  if (q.status) filter.status = { _eq: String(q.status) };
  if (q.entityType && q.entityId) {
    filter.entity_type = { _eq: String(q.entityType) };
    filter.entity_id = { _eq: String(q.entityId) };
  }

  const rows = (await getTypedDirectus().request(
    readItems("ai_actions", {
      filter,
      fields: [
        "id", "action_type", "status", "category", "risk", "outbound",
        "payload", "preview", "result", "error_message", "title",
        "entity_type", "entity_id", "date_created", "date_updated",
        { requested_by: ["first_name", "last_name"] },
        { approved_by: ["first_name", "last_name"] },
      ],
      sort: ["-date_created"],
      limit: Math.min(Number(q.limit) || 50, 200),
    })
  )) as any[];

  // `preview` is a `text` column, so Directus hands it back as a JSON STRING
  // while `payload` and `result` (real json columns) come back as objects —
  // see parseActionPreview() for what that did to every proposal card. The
  // Board Room's step reader parses through the same function, so the two
  // cannot drift.
  return { actions: rows.map(parseActionPreview) };
});
