import { createItem } from "@directus/sdk";
import { computeEndDate } from "#core/shared/projects/schedule";

/** Create an event (milestone/phase) on a project. Write access required. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  const title = String(body?.title || "").trim();
  if (!title) throw createError({ statusCode: 400, message: "title is required" });

  const meta = await getProjectMeta(id);
  if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Project not found" });
  await requireProjectsWrite(event, orgId, meta.team);

  // Links from the body are confirmed to belong to THIS community before they
  // are written (see task-links.ts).
  if (body.depends_on) {
    await requireInOrg("hoa_project_events", String(body.depends_on), orgId, "Milestone not found");
  }
  if (body.assigned_to) await requireOrgMembers(orgId, [String(body.assigned_to)]);

  const directus = getTypedDirectus();
  const end_date =
    body.event_date && body.duration_days
      ? computeEndDate(body.event_date, Number(body.duration_days))
      : body.end_date || null;

  const created = await directus.request(
    createItem("hoa_project_events", {
      project: id,
      organization: orgId,
      status: body.status || "scheduled",
      title,
      description: body.description || null,
      type: body.type || "phase",
      event_date: body.event_date || null,
      duration_days: body.duration_days ?? null,
      end_date,
      is_milestone: !!body.is_milestone,
      depends_on: body.depends_on || null,
      assigned_to: body.assigned_to || null,
      approval: body.approval || "none_needed",
      cost_amount: body.cost_amount ?? null,
      sort: body.sort ?? null,
    } as any)
  );
  return created;
});
