import { deleteItem } from "@directus/sdk";

/**
 * Delete a project. Admin / PM-projects / the team lead of its team.
 * Events/tasks CASCADE; attached requests detach (SET NULL).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const meta = await getProjectMeta(id);
  if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Project not found" });
  await requireProjectsWrite(event, orgId, meta.team);

  const directus = getTypedDirectus();
  await directus.request(deleteItem("hoa_projects", id));
  return { ok: true };
});
