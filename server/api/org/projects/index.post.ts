import { createItem } from "@directus/sdk";

/**
 * Create a project. Admin / PM-projects may create any; a team LEAD may
 * create projects owned by their team (the team field is forced to a team
 * they lead).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  const title = String(body?.title || "").trim();
  if (!title) throw createError({ statusCode: 400, message: "title is required" });

  const access = await getProjectAccess(event, orgId);
  const team = body.team ? String(body.team) : null;
  if (!access.canWriteAll) {
    // Team leads may only create projects under a team they lead.
    if (!team || !access.leadTeamIds.includes(team)) {
      throw createError({ statusCode: 403, message: "Not authorized to create projects" });
    }
  }

  const directus = getTypedDirectus();
  const created = await directus.request(
    createItem("hoa_projects", {
      status: body.status || "planning",
      title,
      description: body.description || null,
      organization: orgId,
      team,
      parent_project: body.parent_project || null,
      parent_event: body.parent_event || null,
      start_date: body.start_date || null,
      due_date: body.due_date || null,
      color: body.color || null,
      icon: body.icon || null,
      member_visible: !!body.member_visible,
      budget_amount: body.budget_amount ?? null,
      actual_spend: body.actual_spend ?? null,
      user_created: access.userId,
      ...(Array.isArray(body.assigned_to) && body.assigned_to.length
        ? { assigned_to: body.assigned_to.map((u: string) => ({ directus_users_id: u })) }
        : {}),
    } as any)
  );

  return created;
});
