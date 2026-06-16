import { readItems, updateItem } from "@directus/sdk";
import { computeEndDate } from "#core/shared/projects/schedule";

/** Update an event. Write access checked via its parent project's team. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_project_events", {
      filter: { id: { _eq: id } },
      fields: ["id", "organization", "event_date", "duration_days", { project: ["id", "team"] }],
      limit: 1,
    })
  );
  const ev = (rows || [])[0] as any;
  if (!ev || ev.organization !== orgId) throw createError({ statusCode: 404, message: "Event not found" });
  const teamId = typeof ev.project?.team === "string" ? ev.project.team : ev.project?.team?.id ?? null;
  await requireProjectsWrite(event, orgId, teamId);

  const patch: Record<string, any> = {};
  const FIELDS = [
    "status", "title", "description", "type", "event_date", "duration_days",
    "is_milestone", "depends_on", "assigned_to", "approval", "cost_amount", "sort",
  ];
  for (const f of FIELDS) if (f in body) patch[f] = body[f];

  // Recompute end_date whenever the start or duration shifts.
  const nextStart = "event_date" in body ? body.event_date : ev.event_date;
  const nextDur = "duration_days" in body ? body.duration_days : ev.duration_days;
  if ("event_date" in body || "duration_days" in body) {
    patch.end_date = nextStart && nextDur ? computeEndDate(nextStart, Number(nextDur)) : null;
  }

  const updated = await directus.request(updateItem("hoa_project_events", id, patch as any));
  return updated;
});
