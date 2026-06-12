import { readItems, deleteItem } from "@directus/sdk";

/** Delete a task (subtasks CASCADE). Write access via the task's project team. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_tasks", {
      filter: { id: { _eq: id }, organization: { _eq: orgId } },
      fields: ["id", { project: ["id", "team"] }],
      limit: 1,
    })
  );
  const task = (rows || [])[0] as any;
  if (!task) throw createError({ statusCode: 404, message: "Task not found" });
  const teamId = typeof task.project?.team === "string" ? task.project.team : task.project?.team?.id ?? null;
  await requireProjectsWrite(event, orgId, teamId);

  await directus.request(deleteItem("hoa_tasks", id));
  return { ok: true };
});
