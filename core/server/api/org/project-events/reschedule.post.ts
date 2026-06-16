import { readItems, updateItem } from "@directus/sdk";
import { computeEndDate } from "#core/shared/projects/schedule";

/**
 * Apply a confirmed dependency-cascade reschedule in one batch. The client
 * computes the shift diff (computeDependencyShifts) and, once the user
 * confirms, posts every changed event here as { id, event_date,
 * duration_days }. The server re-derives each end_date so the timeline stays
 * deterministic, and writes them all. Write access is checked ONCE against the
 * owning project's team — every event must belong to the same project.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  const projectId = String(body?.projectId || "");
  if (!projectId) throw createError({ statusCode: 400, message: "projectId is required" });
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (!changes.length) return { ok: true, updated: 0 };

  const meta = await getProjectMeta(projectId);
  if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Project not found" });
  await requireProjectsWrite(event, orgId, meta.team);

  const directus = getTypedDirectus();

  // Only touch events that actually belong to this project (guard against a
  // client sending ids from another project).
  const owned = await directus.request(
    readItems("hoa_project_events", {
      filter: { project: { _eq: projectId } },
      fields: ["id"],
      limit: 500,
    })
  );
  const ownedIds = new Set((owned || []).map((r: any) => r.id));

  let updated = 0;
  for (const c of changes) {
    const id = String(c?.id || "");
    if (!id || !ownedIds.has(id)) continue;
    const eventDate = c.event_date || null;
    const dur = c.duration_days ?? null;
    const end_date = eventDate && dur ? computeEndDate(eventDate, Number(dur)) : eventDate ? computeEndDate(eventDate, 1) : null;
    await directus.request(
      updateItem("hoa_project_events", id, { event_date: eventDate, duration_days: dur, end_date } as any)
    );
    updated++;
  }

  return { ok: true, updated };
});
