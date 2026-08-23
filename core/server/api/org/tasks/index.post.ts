import { createItem, readItems } from "@directus/sdk";

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

  // Determine category + whether this is a managed (project-linked) task.
  const linkedToProject = !!(body.project || projectEvent);
  if (linkedToProject || body.team) {
    // Resolve the owning team for the write check.
    let teamId: string | null = body.team || null;
    if (body.project) {
      const meta = await getProjectMeta(String(body.project));
      if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Project not found" });
      teamId = meta.team;
    } else if (projectEvent) {
      // A phase-only task: the phase has to be checked on its own, and until
      // now it wasn't checked at all. The row is written with THIS org's id
      // while `project_event` was taken on trust, so an id belonging to
      // another community would have been stored happily — and the list
      // endpoint expands `project_event: ["id", "title"]`, which would then
      // read that community's phase title back out. Resolve it, confirm the
      // org, and take the write check from its project's team.
      const rows = (await getTypedDirectus().request(
        readItems("hoa_project_events", {
          filter: { id: { _eq: String(projectEvent) } },
          fields: ["id", "organization", { project: ["id", "team"] }],
          limit: 1,
        })
      )) as any[];
      const ev = (rows || [])[0];
      if (!ev || ev.organization !== orgId) {
        throw createError({ statusCode: 404, message: "Milestone not found" });
      }
      teamId = typeof ev.project?.team === "string" ? ev.project.team : ev.project?.team?.id ?? null;
    }
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
