import { readItems } from "@directus/sdk";

/**
 * Fetch one project with its events, tasks, attached requests, sub-projects,
 * vendors, and assignees. Members only see member_visible projects (budget
 * stripped); elevated callers see everything.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const access = await getProjectAccess(event, orgId);
  const directus = getTypedDirectus();

  const rows = await directus.request(
    readItems("hoa_projects", {
      filter: { id: { _eq: id }, organization: { _eq: orgId } },
      fields: [
        "id", "status", "title", "description",
        { team: ["id", "name", "color", "icon"] },
        { parent_project: ["id", "title"] },
        { parent_event: ["id", "title"] },
        "start_date", "due_date", "completion_date", "color", "icon", "member_visible",
        "budget_amount", "actual_spend", "sort", "date_created", "date_updated",
        { assigned_to: [{ directus_users_id: ["id", "first_name", "last_name", "avatar", "email"] }] },
        { vendors: ["id", "role", { hoa_vendors_id: ["id", "name", "category"] }] },
        { files: ["id", { directus_files_id: ["id", "filename_download", "type", "filesize"] }] },
        { children: ["id", "title", "status", "due_date"] },
        { requests: ["id", "title", "type", "status"] },
        {
          events: [
            "id", "status", "title", "type", "event_date", "duration_days",
            "end_date", "is_milestone", "approval", "sort",
            { assigned_to: ["id", "first_name", "last_name"] },
            { depends_on: ["id", "title"] },
          ],
        },
        {
          tasks: [
            "id", "status", "title", "priority", "schedule", "due_date",
            "parent_task", "sort",
            { assigned_to: [{ directus_users_id: ["id", "first_name", "last_name", "avatar"] }] },
          ],
        },
      ],
      limit: 1,
    })
  );

  const project = (rows || [])[0] as Record<string, any> | undefined;
  if (!project) throw createError({ statusCode: 404, message: "Project not found" });

  if (!access.elevated) {
    if (!project.member_visible) throw createError({ statusCode: 403, message: "Not authorized" });
    return stripBudgetFields(project, PROJECT_BUDGET_FIELDS);
  }
  return project;
});
