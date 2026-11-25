import { readItems } from "@directus/sdk";
import { projectRowsWithAccess, taskListSpecs } from "#core/server/utils/project-reads";

/**
 * List tasks for an org, scoped by query:
 *   project / event / request / team — tasks under that parent
 *   assignee=me                       — "my tasks" across the org
 *   schedule                          — bucket filter (today/this_week/…)
 *   parent=none                       — top-level only (exclude subtasks)
 *
 * Non-elevated members may only list tasks under a member_visible project.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  // Signed out is refused before anything is read.
  const { userId } = await requireAuthenticatedUser(event);

  // The tasks (as an elevated caller reads them, and limited to a
  // member-visible project when a member is scoped to one) and the caller's
  // standing, in one request (project-reads.ts). The access check decides what
  // comes back; a refused caller gets none of these rows.
  const batched = await projectRowsWithAccess(event, orgId, taskListSpecs(orgId, query, userId));
  if (batched) {
    const { access, rows } = batched;
    if (access.elevated || query.assignee === "me") return rows.tk_all;
    if (query.project) return rows.tk_visible ?? [];
    throw createError({ statusCode: 403, message: "Not authorized" });
  }

  // The batch failed: read as before.
  const access = await getProjectAccess(event, orgId);
  const directus = getTypedDirectus();

  const filter: Record<string, any> = { organization: { _eq: orgId } };
  if (query.project) filter.project = { _eq: String(query.project) };
  if (query.event) filter.project_event = { _eq: String(query.event) };
  if (query.request) filter.request = { _eq: String(query.request) };
  if (query.team) filter.team = { _eq: String(query.team) };
  if (query.schedule) filter.schedule = { _eq: String(query.schedule) };
  if (query.parent === "none") filter.parent_task = { _null: true };
  if (query.assignee === "me") {
    filter.assigned_to = { directus_users_id: { _eq: access.userId } };
  }
  // Members without a project/assignee scope can't enumerate org tasks.
  if (!access.elevated) {
    if (query.assignee === "me") {
      // fine — own tasks
    } else if (query.project) {
      filter.project = { _eq: String(query.project), member_visible: { _eq: true } } as any;
    } else {
      throw createError({ statusCode: 403, message: "Not authorized" });
    }
  }

  const rows = await directus.request(
    readItems("hoa_tasks", {
      filter,
      fields: [
        "id", "status", "title", "description", "priority", "schedule",
        "due_date", "date_completed", "parent_task", "category", "sort",
        { project: ["id", "title"] },
        { project_event: ["id", "title"] },
        { request: ["id", "title"] },
        { subtasks: ["id", "status", "title", "priority", "sort"] },
        { assigned_to: [{ directus_users_id: ["id", "first_name", "last_name", "avatar"] }] },
      ],
      sort: ["sort", "-date_created"],
      limit: 300,
    })
  );
  return rows || [];
});
