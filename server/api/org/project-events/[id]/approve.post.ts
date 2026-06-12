import { readItems, updateItem } from "@directus/sdk";

/**
 * In-app approve / reject a milestone (admin / PM-projects / team lead).
 * Body: { orgId, decision: "approved" | "rejected", note? }. Approving stamps
 * approved_by/at and invalidates the public link; rejecting records the note
 * and clears the link. Notifies whoever requested approval (best-effort).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  const decision = body?.decision === "rejected" ? "rejected" : "approved";

  const meta = await getEventMeta(id);
  if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Event not found" });
  const access = await requireProjectsWrite(event, orgId, meta.projectTeam);

  const directus = getTypedDirectus();

  // Who requested approval (the event's last updater) — best-effort, for the
  // decision ping back.
  let requestedBy: string | null = null;
  try {
    const rows = await directus.request(
      readItems("hoa_project_events", { filter: { id: { _eq: id } }, fields: ["user_created"], limit: 1 })
    );
    const r = rows?.[0] as any;
    requestedBy = (typeof r?.user_created === "string" ? r.user_created : r?.user_created?.id) || null;
  } catch {
    /* best effort */
  }

  await directus.request(
    updateItem("hoa_project_events", id, {
      approval: decision,
      approved_by: decision === "approved" ? access.userId : null,
      approved_at: decision === "approved" ? new Date().toISOString() : null,
      approval_note: body?.note ? String(body.note).slice(0, 2000) : null,
      approval_token: null,
      approval_token_expires: null,
    } as any)
  );

  await notifyApprovalDecided({ id, title: meta.title }, access.userId, decision === "approved", requestedBy).catch(
    () => {}
  );

  return { ok: true, decision };
});
