import { updateItem } from "@directus/sdk";

/**
 * Update a project. Admin / PM-projects may edit any; a team lead may edit
 * their team's projects (checked against the project's CURRENT team).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const meta = await getProjectMeta(id);
  if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Project not found" });
  await requireProjectsWrite(event, orgId, meta.team);

  const directus = getTypedDirectus();

  // Whitelist updatable fields; assignees handled via the M2M alias.
  const patch: Record<string, any> = {};
  const FIELDS = [
    "status", "title", "description", "team", "parent_project", "parent_event",
    "start_date", "due_date", "completion_date", "color", "icon",
    "member_visible", "budget_amount", "actual_spend", "sort",
  ];
  for (const f of FIELDS) if (f in body) patch[f] = body[f];
  if (Array.isArray(body.assigned_to)) {
    patch.assigned_to = body.assigned_to.map((u: string) => ({ directus_users_id: u }));
  }
  // Vendor set (M2M with a per-assignment role note). Replaces the whole set.
  if (Array.isArray(body.vendors)) {
    patch.vendors = body.vendors
      .filter((v: any) => v && (v.vendor || v.hoa_vendors_id))
      .map((v: any) => ({ hoa_vendors_id: v.vendor || v.hoa_vendors_id, role: v.role ?? null }));
  }
  if (body.status === "completed" && !("completion_date" in body)) {
    patch.completion_date = new Date().toISOString().slice(0, 10);
  }

  const updated = await directus.request(updateItem("hoa_projects", id, patch as any));
  return updated;
});
