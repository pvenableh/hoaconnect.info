import { readItem } from "@directus/sdk";

/**
 * Fire inquiry-routing notifications for a newly-created request.
 *
 * Called fire-and-forget from the client after createRequest() succeeds. The
 * heavy lifting (resolve routing → contacts + board, send in-app + email) runs
 * with the admin token in routeInquiryNotifications(); this handler just
 * authorizes the caller: they must be an active member of the request's org.
 *
 * Body: { requestId: string }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const requestId = body?.requestId;
  if (!requestId) {
    throw createError({ statusCode: 400, message: "requestId is required" });
  }

  await requireAuthenticatedUser(event);

  // Resolve the request's org and confirm the caller belongs to it (prevents a
  // logged-in user from triggering notifications for an arbitrary org).
  const directus = getTypedDirectus();
  const req: any = await directus.request(
    readItem("hoa_requests", requestId, { fields: ["id", "organization"] })
  );
  if (!req) throw createError({ statusCode: 404, message: "Request not found" });
  const orgId = typeof req.organization === "string" ? req.organization : req.organization?.id;
  if (!orgId) throw createError({ statusCode: 422, message: "Request has no organization" });

  const { isMember } = await checkMembership(event, orgId);
  if (!isMember) {
    throw createError({ statusCode: 403, message: "Not a member of this organization" });
  }

  return await routeInquiryNotifications(requestId);
});
