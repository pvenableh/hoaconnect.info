import { readItems, deleteItem } from "@directus/sdk";

/** Delete an event. Write access checked via its parent project's team. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_project_events", {
      filter: { id: { _eq: id } },
      fields: ["id", "organization", { project: ["id", "team"] }],
      limit: 1,
    })
  );
  const ev = (rows || [])[0] as any;
  if (!ev || ev.organization !== orgId) throw createError({ statusCode: 404, message: "Event not found" });
  const teamId = typeof ev.project?.team === "string" ? ev.project.team : ev.project?.team?.id ?? null;
  await requireProjectsWrite(event, orgId, teamId);

  await directus.request(deleteItem("hoa_project_events", id));
  return { ok: true };
});
