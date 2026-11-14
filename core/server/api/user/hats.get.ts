/**
 * GET /api/user/hats — the session user's hats in each of their communities,
 * for the org switcher's badge (docs/spec-capability-nav.md). Only the
 * caller's own memberships; nothing in the query is read. Identity only:
 * nothing here grants access.
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  return { hats: await getMembershipHats(event) };
});
