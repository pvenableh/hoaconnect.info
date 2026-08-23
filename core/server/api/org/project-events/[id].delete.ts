import { readItems, deleteItem, updateItems } from "@directus/sdk";

/**
 * Delete an event (milestone/phase). Write access checked via its parent
 * project's team.
 *
 * A phase's tasks are NOT deleted with it — unlike deleting the whole project,
 * removing one phase doesn't mean the work stopped mattering. Most often the
 * phase was mis-scoped and its tasks belong to the project either way, so:
 *
 *   task with a project too    keeps it; the schema nulls `project_event` and
 *                              the task simply stops being tied to the phase.
 *   task with ONLY the phase   re-parented to the phase's project FIRST, so it
 *                              lands in the project's task list instead of
 *                              becoming an un-attributable orphan.
 *
 * The patch has to happen BEFORE the delete: `hoa_tasks.project_event` is SET
 * NULL, so once the event is gone there is nothing left to find those tasks by.
 *
 * The confirm dialog for this only says `Remove "<title>"?` and promises
 * nothing about tasks, which stays true — nothing is lost either way.
 */
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

  const projectId = typeof ev.project === "string" ? ev.project : ev.project?.id ?? null;

  // Rehome the phase-only tasks while the link still exists.
  if (projectId) {
    const stranded = (await directus.request(
      readItems("hoa_tasks", {
        filter: {
          organization: { _eq: orgId },
          project_event: { _eq: id },
          project: { _null: true },
        },
        fields: ["id"],
        limit: -1,
      })
    )) as { id: string }[];

    if (stranded?.length) {
      await directus.request(
        updateItems("hoa_tasks", stranded.map((t) => t.id), {
          project: projectId,
          category: "project",
        } as any)
      );
    }
  }

  await directus.request(deleteItem("hoa_project_events", id));
  return { ok: true };
});
