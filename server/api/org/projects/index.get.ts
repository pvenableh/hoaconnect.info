import { readItems } from "@directus/sdk";

/**
 * List projects for an org.
 *   - Elevated callers (admin / PM-projects / team members) see everything
 *     including budget fields.
 *   - Members see only member_visible projects, budget fields stripped.
 * Optional filters: status, team, parent ("none" = top-level only).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const access = await getProjectAccess(event, orgId);
  const directus = getTypedDirectus();

  const filter: Record<string, any> = { organization: { _eq: orgId } };
  if (query.status) filter.status = { _eq: String(query.status) };
  if (query.team) filter.team = { _eq: String(query.team) };
  if (query.parent === "none") filter.parent_project = { _null: true };
  else if (query.parent) filter.parent_project = { _eq: String(query.parent) };
  if (!access.elevated) filter.member_visible = { _eq: true };

  const rows = await directus.request(
    readItems("hoa_projects", {
      filter,
      // Directus SDK v20 rejects dotted query strings — nested object form.
      fields: [
        "id", "status", "title", "description",
        { team: ["id", "name", "color"] },
        { parent_project: ["id", "title"] },
        { parent_event: ["id", "title"] },
        "start_date", "due_date", "completion_date", "color", "icon", "member_visible",
        "budget_amount", "actual_spend", "sort", "date_created", "date_updated",
        { assigned_to: [{ directus_users_id: ["id", "first_name", "last_name", "avatar"] }] },
        { events: ["id", "status", "is_milestone", "event_date"] },
        { children: ["id", "title", "status"] },
        { requests: ["id"] },
        { tasks: ["id", "status"] },
      ],
      sort: ["sort", "-date_updated"],
      limit: 200,
    })
  );

  const list = (rows || []) as Record<string, any>[];
  if (access.elevated) return list;
  return list.map((r) => stripBudgetFields(r, PROJECT_BUDGET_FIELDS));
});
