// POST /api/org/activity — record a batch of portal activity events.
//
// Identity is derived from the SESSION, never the client: the caller must be a
// member or admin of the org, and the member/user/ip/user_agent are resolved
// server-side so events can't be forged for another person or tenant. The
// client tracker no-ops in "view as member" preview, so admin previews don't
// pollute resident activity.

import { createItems } from "@directus/sdk";
import { normalizeActivityBatch } from "#core/shared/activity/events";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  // Body may arrive via fetch or navigator.sendBeacon (text/plain) — readBody
  // handles both; tolerate a raw-JSON fallback.
  let body: any = await readBody(event);
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const orgId = String(body?.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  // Authorization: a member or admin of THIS org.
  const membership = await checkMembership(event, orgId);
  const admin = await checkAdminAccess(event, orgId);
  if (!membership.isMember && !admin.isAdmin) {
    throw createError({ statusCode: 403, message: "Not a member of this organization" });
  }

  const events = normalizeActivityBatch(body?.events);
  if (events.length === 0) return { written: 0 };

  // Server-side context (never trusted from the client).
  const ip = getRequestIP(event, { xForwardedFor: true }) || null;
  const userAgent = getHeader(event, "user-agent") || null;
  const userId = (admin.userId as string) || ((await getUserSession(event)).user as any)?.id || null;

  const rows = events.map((e) => ({
    organization: orgId,
    member: membership.memberId ?? null,
    user: userId,
    event_type: e.event_type,
    path: e.path,
    target_collection: e.target_collection,
    target_id: e.target_id,
    label: e.label,
    metadata: e.metadata,
    session_id: e.session_id,
    ip,
    user_agent: userAgent,
  }));

  try {
    await getTypedDirectus().request(createItems("hoa_activity", rows as any));
  } catch (err) {
    console.error("[org/activity] write failed:", err);
    // Activity logging must never break the user's action.
    return { written: 0, error: true };
  }

  return { written: rows.length };
});
