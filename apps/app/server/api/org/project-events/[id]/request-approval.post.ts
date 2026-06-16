import { updateItem } from "@directus/sdk";

/**
 * Flag a milestone as needing approval and mint a public approval link.
 *
 * Sets approval=needs_approval, generates an unguessable token (expiring in
 * `days` days, default 14), pings the org's approvers in-app, and returns the
 * shareable link. Write access required (admin / PM-projects / team lead).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const meta = await getEventMeta(id);
  if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Event not found" });
  const access = await requireProjectsWrite(event, orgId, meta.projectTeam);

  const days = Math.min(Math.max(Number(body?.days) || 14, 1), 90);
  const expires = new Date(Date.now() + days * 86_400_000).toISOString();
  const token = generateApprovalToken();

  const directus = getTypedDirectus();
  await directus.request(
    updateItem("hoa_project_events", id, {
      approval: "needs_approval",
      approval_token: token,
      approval_token_expires: expires,
      approved_by: null,
      approved_at: null,
    } as any)
  );

  // Ping approvers in-app (best-effort).
  await notifyApprovalRequested(orgId, { id, title: meta.title, projectTitle: meta.projectTitle }, access.userId).catch(
    () => {}
  );

  const appUrl = useRuntimeConfig().public.appUrl;
  return {
    ok: true,
    token,
    expires,
    link: `${appUrl.replace(/\/$/, "")}/approve/${token}`,
  };
});
