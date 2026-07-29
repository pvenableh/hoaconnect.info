// POST /api/ai/actions/:id/edit — tweak a PENDING proposal's payload before
// approving it (e.g. reword a drafted email, fix a due date). Recomputes the
// preview + title server-side so the card and the executor stay in agreement.
// Never touches action_type/org/status. Comms-gated + org-scoped. (Phase 4.)

import { readItem, updateItem } from "@directus/sdk";
import { buildProposalDisplay } from "#core/server/utils/ai-actions";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const body = await readBody(event);
  const orgId = String(body?.orgId || "").trim();
  const payload = body?.payload;
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!payload || typeof payload !== "object") throw createError({ statusCode: 400, message: "payload is required" });
  await requireOrgComposeAccess(event, orgId);

  const directus = getTypedDirectus();
  const row = (await directus.request(
    readItem("ai_actions", id, { fields: ["id", "organization", "status", "action_type"] })
  )) as any;
  if (!row) throw createError({ statusCode: 404, message: "Action not found" });
  const rowOrg = typeof row.organization === "string" ? row.organization : row.organization?.id;
  if (rowOrg !== orgId) throw createError({ statusCode: 404, message: "Action not found" });
  if (row.status !== "pending") throw createError({ statusCode: 409, message: `Action already ${row.status}` });

  const display = buildProposalDisplay(row.action_type, payload);
  await directus.request(
    updateItem("ai_actions", id, {
      payload,
      ...(display ? { preview: display.preview, title: display.title } : {}),
    } as any)
  );
  return { id, updated: true };
});
