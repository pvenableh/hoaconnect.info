import { createItem } from "@directus/sdk";

/**
 * Create a task. Write access required for project/event/team tasks; a
 * personal "quick" task (no parent links) only needs membership.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  const title = String(body?.title || "").trim();
  if (!title) throw createError({ statusCode: 400, message: "title is required" });

  const access = await getProjectAccess(event, orgId);

  // Determine category + whether this is a managed (project-linked) task.
  const linkedToProject = !!(body.project || body.project_event);
  if (linkedToProject || body.team) {
    // Resolve the owning team for the write check.
    let teamId: string | null = body.team || null;
    if (body.project) {
      const meta = await getProjectMeta(String(body.project));
      if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Project not found" });
      teamId = meta.team;
    }
    await requireProjectsWrite(event, orgId, teamId);
  }

  const category =
    body.category ||
    (body.project_event ? "event" : body.project ? "project" : body.request ? "request" : body.team ? "team" : "quick");

  const directus = getTypedDirectus();
  const created = await directus.request(
    createItem("hoa_tasks", {
      organization: orgId,
      status: body.status || "new",
      title,
      description: body.description || null,
      priority: body.priority || "medium",
      schedule: body.schedule || "unscheduled",
      due_date: body.due_date || null,
      parent_task: body.parent_task || null,
      category,
      project: body.project || null,
      project_event: body.project_event || null,
      request: body.request || null,
      team: body.team || null,
      sort: body.sort ?? null,
      user_created: access.userId,
      ...(Array.isArray(body.assigned_to) && body.assigned_to.length
        ? { assigned_to: body.assigned_to.map((u: string) => ({ directus_users_id: u })) }
        : {}),
    } as any)
  );

  // Ping the assignees (best-effort, never the creator).
  if (Array.isArray(body.assigned_to) && body.assigned_to.length) {
    await notifyTaskAssigned(orgId, body.assigned_to, { id: (created as any)?.id, title }, access.userId).catch(() => {});
  }

  return created;
});
