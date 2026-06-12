import { readItems } from "@directus/sdk";

/**
 * All projects for an org with the timeline data the org-wide view needs:
 * dates, colour, parent_event (for subway-map branches) and each project's
 * events (date/end/milestone/approval). Elevated callers see everything;
 * members see only member_visible projects (budget stripped — not returned
 * here anyway).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const access = await getProjectAccess(event, orgId);
  const directus = getTypedDirectus();

  const filter: Record<string, any> = { organization: { _eq: orgId } };
  if (!access.elevated) filter.member_visible = { _eq: true };

  const rows = await directus.request(
    readItems("hoa_projects", {
      filter,
      fields: [
        "id", "status", "title", "color", "icon",
        "start_date", "due_date", "completion_date", "member_visible",
        { team: ["id", "name", "color"] },
        { parent_event: ["id", "title", { project: ["id"] }] },
        {
          events: [
            "id", "status", "title", "type", "event_date", "end_date",
            "duration_days", "is_milestone", "approval", "sort",
          ],
        },
      ],
      sort: ["sort", "start_date"],
      limit: 300,
    })
  );

  return (rows || []) as Record<string, any>[];
});
