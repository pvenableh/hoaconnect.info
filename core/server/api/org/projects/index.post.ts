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

  // Every link in the body is confirmed to belong to THIS community before it
  // is written (see task-links.ts). GET /api/org/projects/:id expands the team,
  // the parent project and phase, and each assignee's name and email, so an
  // unchecked id is a read of another community's rows, not a dangling pointer.
  if (team) await requireInOrg("hoa_teams", team, orgId, "Team not found");
  if (body.parent_project) {
    await requireInOrg("hoa_projects", String(body.parent_project), orgId, "Project not found");
  }
  if (body.parent_event) {
    await requireInOrg("hoa_project_events", String(body.parent_event), orgId, "Milestone not found");
  }
  if (Array.isArray(body.assigned_to)) await requireOrgMembers(orgId, body.assigned_to);

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
