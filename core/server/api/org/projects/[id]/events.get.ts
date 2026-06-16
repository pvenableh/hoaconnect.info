import { readItems } from "@directus/sdk";

/** List a project's events (milestones/phases) in timeline order. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const access = await getProjectAccess(event, orgId);
  const meta = await getProjectMeta(id);
  if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Project not found" });
  if (!access.elevated && !meta.member_visible) {
    throw createError({ statusCode: 403, message: "Not authorized" });
  }

  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_project_events", {
      filter: { project: { _eq: id } },
      fields: [
        "id", "status", "title", "description", "type", "event_date",
        "duration_days", "end_date", "is_milestone", "approval",
        "approved_at", "approval_note", "approval_token_expires",
        "cost_amount", "sort", "date_created",
        { assigned_to: ["id", "first_name", "last_name", "avatar"] },
        { depends_on: ["id", "title"] },
        { tasks: ["id", "status", "title"] },
        { spawned_projects: ["id", "title", "status"] },
      ],
      sort: ["sort", "event_date"],
      limit: 200,
    })
  );

  const list = (rows || []) as Record<string, any>[];
  if (access.elevated) return list;
  // Members never see cost, the approver's note, or the live link expiry.
  return list.map((r) => stripBudgetFields(r, [...EVENT_BUDGET_FIELDS, "approval_note", "approval_token_expires"]));
});
