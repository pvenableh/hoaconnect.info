/**
 * GET /api/hoa/channels/unread
 *
 * Per-channel unread counts for the signed-in user — the roster badges, the
 * thread's "New" divider anchor, and the dock/OS badge all read this one
 * number so they cannot disagree about what unread means.
 *
 * The algorithm lives in `channel-unread.ts`; this route supplies the two
 * things only a request can know: who is asking, and which of their communities
 * they read channels org-wide in (admins and seated board members — see the
 * util's header for why that distinction is load-bearing in HOA).
 *
 * Failures return zeros rather than a 500. These are badges: a Directus blip
 * during the post-login request burst should cost the member a number, not a
 * red error on a page that otherwise works. The real error is logged so prod
 * still shows the cause.
 */

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  try {
    return await computeChannelUnread({
      directus,
      userId,
      hasOrgWideAccess: async (orgId) => {
        if ((await checkAdminAccess(event, orgId)).isAdmin) return true;
        return await isActiveBoardMember(directus, userId, orgId);
      },
    });
  } catch (err: any) {
    console.error("[channels/unread] Failed, returning empty:", err?.message || err);
    return { channels: {}, total: 0 };
  }
});
