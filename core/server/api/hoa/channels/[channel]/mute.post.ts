/**
 * POST /api/hoa/channels/:channel/mute
 *
 * Turn one channel's notifications off (or back on) for the caller.
 *
 * `hoa_channel_members.notifications_enabled` — HOA's spelling of Earnest's
 * `muted` — has been in the schema since channels shipped and honoured by
 * `channel-unread.ts` since Phase 3: a muted channel still reports its own
 * count so the roster can show it, but is excluded from the total. Nothing
 * could ever set it. This is that half.
 *
 * Authorization is deliberately the same shape as `read.post.ts`, for the same
 * reason: you may mute a channel you could have read anyway — your own
 * membership row, or a non-private channel in a community you administer or sit
 * on the board of. Muting is not a grant, and nothing here can widen what you
 * can see.
 *
 * Auto-joins on the same terms too. An admin reading a channel org-wide has no
 * membership row until they interact with it; muting is an interaction, so the
 * row gets created muted rather than the request being refused. Without that,
 * the one population most likely to want a channel quiet — an admin who sees
 * every channel in the community — would be the one population unable to.
 *
 * Body: `{ muted: boolean }`. Stored inverted (`notifications_enabled = !muted`)
 * because that is the column, and the column is phrased the other way round.
 *
 * ⚠️ Writes on the admin client. That is deliberate and matches every other
 * channel route, but it is also the thing that hid a real permissions fault
 * once before — a static-token write succeeds whether or not the CALLER could
 * have made it, so the authorization above is load-bearing rather than
 * belt-and-braces.
 */

import { readItems, createItem, updateItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, "channel");
  if (!channelId) throw createError({ statusCode: 400, message: "channel is required" });

  const body = await readBody(event).catch(() => ({}) as any);
  if (typeof body?.muted !== "boolean") {
    throw createError({ statusCode: 400, message: "muted must be a boolean" });
  }
  const notificationsEnabled = !body.muted;

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  const channel = (
    (await directus.request(
      readItems("hoa_channels", {
        filter: { id: { _eq: channelId } },
        fields: ["id", "organization", "is_private", "status"],
        limit: 1,
      })
    )) as any[]
  )[0];
  if (!channel || channel.status === "deleted") {
    throw createError({ statusCode: 404, message: "Channel not found" });
  }

  const orgId =
    typeof channel.organization === "string" ? channel.organization : channel.organization?.id;

  const existing = (
    (await directus.request(
      readItems("hoa_channel_members", {
        filter: { channel: { _eq: channelId }, user: { _eq: userId } },
        fields: ["id", "notifications_enabled"],
        limit: 1,
      })
    )) as any[]
  )[0];

  if (!existing) {
    // No row → no membership grant, so fall back to the org-wide read the
    // channel would have been visible under. A private channel has no such
    // path: without a row there is nothing to mute.
    const orgWide =
      !!orgId &&
      channel.is_private !== true &&
      ((await checkAdminAccess(event, orgId)).isAdmin ||
        (await isActiveBoardMember(directus, userId, orgId)));
    if (!orgWide) throw createError({ statusCode: 403, message: "Not a member of this channel" });
  }

  if (existing) {
    if (existing.notifications_enabled !== notificationsEnabled) {
      await directus.request(
        updateItem("hoa_channel_members", existing.id, {
          notifications_enabled: notificationsEnabled,
        })
      );
    }
  } else {
    await directus.request(
      createItem("hoa_channel_members", {
        channel: channelId,
        user: userId,
        role: "member",
        notifications_enabled: notificationsEnabled,
      })
    );
  }

  return { ok: true, channel: channelId, muted: body.muted };
});
