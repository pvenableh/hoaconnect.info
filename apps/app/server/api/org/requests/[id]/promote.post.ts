import { readItems, createItem, updateItem, createItems } from "@directus/sdk";

/**
 * Promote a request into a project: create an hoa_projects row from the
 * request (title/description/assignee carried over), attach the request to
 * it, and post a system comment to the request thread. Admin / PM-projects.
 */
export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, "id");
  if (!requestId) throw createError({ statusCode: 400, message: "id is required" });
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  // Promotion is a broad action — admin or PM with the projects grant.
  await requireAdminOrManagerGrant(event, orgId, "projects");

  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_requests", {
      filter: { id: { _eq: requestId }, organization: { _eq: orgId } },
      fields: ["id", "title", "description", "project", { assigned_to: ["id"] }],
      limit: 1,
    })
  );
  const request = (rows || [])[0] as any;
  if (!request) throw createError({ statusCode: 404, message: "Request not found" });
  if (request.project) {
    throw createError({ statusCode: 409, message: "Request is already linked to a project" });
  }

  const assigneeId = typeof request.assigned_to === "string" ? request.assigned_to : request.assigned_to?.id;

  const project = await directus.request(
    createItem("hoa_projects", {
      status: "planning",
      title: body.title?.trim() || request.title || "Untitled project",
      description: request.description || null,
      organization: orgId,
      team: body.team || null,
      member_visible: !!body.member_visible,
      ...(assigneeId ? { assigned_to: [{ directus_users_id: assigneeId }] } : {}),
    } as any)
  );
  const projectId = (project as any)?.id;

  await directus.request(updateItem("hoa_requests", requestId, { project: projectId } as any));

  // System comment on the request thread (matches the transition-comment
  // pattern in useRequests). Best-effort — never fail promotion on this.
  try {
    await directus.request(
      createItems("hoa_comments", [
        {
          target_collection: "hoa_requests",
          target_id: requestId,
          organization: orgId,
          is_internal: true,
          body: `<p><em>Promoted to project — <strong>${project.title || "project"}</strong></em></p>`,
        },
      ] as any)
    );
  } catch (e) {
    console.warn("[promote] system comment failed:", e);
  }

  return { ok: true, projectId, project };
});
