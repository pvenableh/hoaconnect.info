/**
 * POST /api/org/requests/status-event   (Earnest parity round 3, Phase 5b)
 *
 *   { requestId }
 *
 * "Your request is now …": tells the person who submitted a request that its
 * status changed, right when it does. `useRequests().applyTransition` writes
 * the status from the browser (there is no server route that does), so it calls
 * this once its write has landed.
 *
 * The route trusts nothing in the call but the request id. What goes out is
 * read from the request as it stands — its status, its `status_changed_at`, who
 * submitted it — by the same engine rule the hourly tick runs, under the same
 * log key; a call for a change that didn't happen finds nothing due, and a
 * second call (or the tick) finds the key taken. So any member of the community
 * may call it, like `POST /api/hoa/requests/notify`: the worst they can do is
 * announce, once, what the board already did.
 */
import { readItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const requestId = String(body?.requestId ?? "").trim();
  if (!requestId) throw createError({ statusCode: 400, statusMessage: "requestId is required" });

  await requireAuthenticatedUser(event);

  const req: any = await getTypedDirectus()
    .request(readItem("hoa_requests", requestId, { fields: ["id", "organization"] }))
    .catch(() => null);
  if (!req) throw createError({ statusCode: 404, statusMessage: "Request not found" });
  const orgId = typeof req.organization === "string" ? req.organization : req.organization?.id;
  if (!orgId) throw createError({ statusCode: 422, statusMessage: "Request has no organization" });

  const { isMember } = await checkMembership(event, String(orgId));
  if (!isMember) throw createError({ statusCode: 403, statusMessage: "Not a member of this organization" });

  const result = await notifyReminderEvent(String(orgId), { collection: "hoa_requests", id: requestId }, "status");
  return { success: true, ...(result ?? { recipients: 0, sent: 0, skipped: 0, lost: 0, failed: 0 }) };
});
