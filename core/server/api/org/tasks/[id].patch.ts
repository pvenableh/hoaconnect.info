import { readItems, updateItem } from "@directus/sdk";

/**
 * Update a task. Full edit needs project-write access; an assignee may flip
 * their own task's status/schedule (and mark it done) without it.
 *
 * The link fields are re-validated on every patch, because this route can
 * REASSIGN them and until now checked none of them — not even `project`, which
 * the create route always checked. Moving a task onto another community's
 * project, phase or request was a single PATCH away, and the list endpoint
 * expands those into titles, so the row came back reading as that community's
 * work. See task-links.ts.
 *
 * A move also has to satisfy the DESTINATION, not just the origin. The write
 * check below runs against the task's current project team; a team lead who
 * passed it could otherwise push the task into a project they have no rights
 * over, which is a privilege escalation dressed as an edit.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const access = await getProjectAccess(event, orgId);
  const directus = getTypedDirectus();

  const rows = await directus.request(
    readItems("hoa_tasks", {
      filter: { id: { _eq: id }, organization: { _eq: orgId } },
      fields: ["id", "organization", { project: ["id", "team"] }, { assigned_to: [{ directus_users_id: ["id"] }] }],
      limit: 1,
    })
  );
  const task = (rows || [])[0] as any;
  if (!task) throw createError({ statusCode: 404, message: "Task not found" });

  const isAssignee = (task.assigned_to || []).some(
    (a: any) => (typeof a.directus_users_id === "string" ? a.directus_users_id : a.directus_users_id?.id) === access.userId
  );

  // Fields an assignee may self-serve vs. fields requiring write access.
  const STATUS_FIELDS = ["status", "schedule"];
  const FULL_FIELDS = [
    "title", "description", "priority", "due_date", "parent_task", "category",
    "project", "project_event", "request", "team", "sort",
  ];
  const wantsFull = FULL_FIELDS.some((f) => f in body) || Array.isArray(body.assigned_to);

  if (wantsFull || !(access.elevated || isAssignee)) {
    const teamId = typeof task.project?.team === "string" ? task.project.team : task.project?.team?.id ?? null;
    await requireProjectsWrite(event, orgId, teamId);
  }

  // Only the links this patch actually names are resolved — an edit that
  // touches nothing but the title costs no extra reads.
  const moving = {
    project: "project" in body ? body.project : undefined,
    project_event: "project_event" in body ? body.project_event : undefined,
    request: "request" in body ? body.request : undefined,
    team: "team" in body ? body.team : undefined,
    parent_task: "parent_task" in body ? body.parent_task : undefined,
    assigned_to: Array.isArray(body.assigned_to) ? body.assigned_to : null,
  };
  const destination = await resolveTaskLinks(orgId, moving);

  // Clearing a link (`project: null`) needs no destination check — there is no
  // destination. Only an actual move does.
  if (moving.project || moving.project_event || moving.team) {
    await requireProjectsWrite(event, orgId, destination.teamId);
  }

  const patch: Record<string, any> = {};
  for (const f of [...STATUS_FIELDS, ...FULL_FIELDS]) if (f in body) patch[f] = body[f];
  if (Array.isArray(body.assigned_to)) {
    patch.assigned_to = body.assigned_to.map((u: string) => ({ directus_users_id: u }));
  }
  if (body.status === "completed" && !task.date_completed) {
    patch.date_completed = new Date().toISOString();
  } else if (body.status && body.status !== "completed") {
    patch.date_completed = null;
  }

  const updated = await directus.request(updateItem("hoa_tasks", id, patch as any));

  // Ping only the NEWLY added assignees (best-effort).
  if (Array.isArray(body.assigned_to)) {
    const existing = new Set(
      (task.assigned_to || []).map((a: any) =>
        typeof a.directus_users_id === "string" ? a.directus_users_id : a.directus_users_id?.id
      )
    );
    const added = body.assigned_to.filter((u: string) => !existing.has(u));
    if (added.length) {
      await notifyTaskAssigned(orgId, added, { id, title: (updated as any)?.title || task.title }, access.userId).catch(() => {});
    }
  }

  return updated;
});
