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

  // GET /api/org/tasks takes the phase as `event` and maps it to the column;
  // this handler only ever read `project_event`, so every caller using the
  // scope shape the list endpoint defines — TaskList's `{ project, event,
  // request }` among them — silently created a task with no phase link at all.
  // Accept both spellings here rather than making one caller special.
  const projectEvent = body.project_event || body.event || null;

  // Every link is confirmed to belong to THIS community before it is written.
  // See task-links.ts: an unchecked id is a cross-tenant read, not a dangling
  // pointer, because the list endpoint expands these into titles.
  const { teamId, linkedToProject } = await resolveTaskLinks(orgId, {
    project: body.project,
    project_event: projectEvent,
    request: body.request,
    team: body.team,
    parent_task: body.parent_task,
    assigned_to: Array.isArray(body.assigned_to) ? body.assigned_to : null,
  });

  if (linkedToProject || body.team) {
    await requireProjectsWrite(event, orgId, teamId);
  }

  const category =
    body.category ||
    (projectEvent ? "event" : body.project ? "project" : body.request ? "request" : body.team ? "team" : "quick");

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
      project_event: projectEvent,
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
