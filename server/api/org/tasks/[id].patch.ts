import { readItems, updateItem } from "@directus/sdk";

/**
 * Update a task. Full edit needs project-write access; an assignee may flip
 * their own task's status/schedule (and mark it done) without it.
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
  return updated;
});
