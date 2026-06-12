import { readItems, updateItem } from "@directus/sdk";

/**
 * Batch reorder/move tasks after a kanban drag. Body:
 *   { orgId, items: [{ id, sort, status?, schedule?, parent_task? }] }
 * All items must belong to the org; write access is checked once against the
 * caller's broad rights (admin/PM) or — for team-lead scope — per touched
 * project team.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return { ok: true, updated: 0 };

  const access = await getProjectAccess(event, orgId);
  const directus = getTypedDirectus();

  const ids = items.map((i: any) => String(i.id)).filter(Boolean);
  const rows = await directus.request(
    readItems("hoa_tasks", {
      filter: { id: { _in: ids }, organization: { _eq: orgId } },
      fields: ["id", { project: ["team"] }],
      limit: ids.length,
    })
  );
  const found = new Map((rows || []).map((r: any) => [r.id, r]));

  // Authorize: broad writers pass; otherwise every touched task's project
  // team must be one the caller leads.
  if (!access.canWriteAll) {
    for (const r of rows as any[]) {
      const teamId = typeof r.project?.team === "string" ? r.project.team : r.project?.team?.id ?? null;
      if (!teamId || !access.leadTeamIds.includes(teamId)) {
        throw createError({ statusCode: 403, message: "Not authorized to reorder these tasks" });
      }
    }
  }

  let updated = 0;
  for (const item of items) {
    if (!found.has(String(item.id))) continue;
    const patch: Record<string, any> = {};
    if ("sort" in item) patch.sort = item.sort;
    if ("status" in item) patch.status = item.status;
    if ("schedule" in item) patch.schedule = item.schedule;
    if ("parent_task" in item) patch.parent_task = item.parent_task;
    if (item.status === "completed") patch.date_completed = new Date().toISOString();
    await directus.request(updateItem("hoa_tasks", String(item.id), patch as any));
    updated++;
  }
  return { ok: true, updated };
});
