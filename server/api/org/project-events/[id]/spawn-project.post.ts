import { readItems, createItem } from "@directus/sdk";

/**
 * Spawn a follow-on project from a milestone. The new project carries
 * parent_event = this event (so the timeline can draw a subway-map branch
 * back to it) and inherits the source project's org, team, and member
 * visibility. Write access required (admin / PM-projects / team lead).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const meta = await getEventMeta(id);
  if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Event not found" });
  const access = await requireProjectsWrite(event, orgId, meta.projectTeam);

  // Inherit member_visibility from the source project.
  const directus = getTypedDirectus();
  let memberVisible = false;
  if (meta.projectId) {
    try {
      const src = await getProjectMeta(meta.projectId);
      memberVisible = src.member_visible;
    } catch {
      /* default false */
    }
  }

  const title = String(body?.title || "").trim() || `${meta.title || "Milestone"} — follow-up`;
  const created = await directus.request(
    createItem("hoa_projects", {
      status: "planning",
      title,
      organization: orgId,
      team: meta.projectTeam || null,
      parent_event: id,
      member_visible: body?.member_visible != null ? !!body.member_visible : memberVisible,
      start_date: body?.start_date || null,
      user_created: access.userId,
    } as any)
  );

  return { ok: true, projectId: (created as any)?.id, project: created };
});
