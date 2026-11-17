/**
 * GET /api/org/member-names?orgId=&users=a,b,c — the membership name of each
 * login in this community, for the pages that show other people's names (chat,
 * comments, requests). core/shared/members/display-name.ts says why the
 * membership's name wins.
 *
 * Who: a live member of the community (active or pending) or its admin.
 * Returns names only, never contact fields, and only for logins with a
 * membership here; at most 200 ids per call.
 */
import { memberNamesFor } from "#core/server/utils/member-names";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const q = getQuery(event);
  const orgId = String(q.orgId ?? "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const [admin, membership] = await Promise.all([checkAdminAccess(event, orgId), checkMembership(event, orgId)]);
  if (!admin.isAdmin && !membership.isMember) {
    throw createError({ statusCode: 403, message: "You must be a member of this community" });
  }

  const users = String(q.users ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  const names = await memberNamesFor(orgId, users);
  return { names: Object.fromEntries(names) };
});
