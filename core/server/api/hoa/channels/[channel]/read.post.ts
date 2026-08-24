/**
 * POST /api/hoa/channels/:channel/read
 *
 * Advance the caller's read cursor for one channel. This is the write half of
 * `unread.get.ts`, and until now it did not exist: `hoa_channel_members.
 * last_read_at` has been in the schema since channels shipped and was never
 * once written, which is why every "unread" surface in the app before this
 * phase was either absent or guessing.
 *
 * Auto-joins, like Earnest's: reading a channel you are entitled to but have no
 * row for creates the row. That is what turns bucket 2 of the unread
 * computation (an admin's org-wide channels) into bucket 1 the moment they
 * actually open one — a cursor exists from then on, so the org-join floor stops
 * being consulted for that channel.
 *
 * Authorization is deliberately the same shape as reading: you may advance a
 * cursor for a channel you could have read anyway — your own membership row, or
 * a non-private channel in a community you administer or sit on the board of.
 * A cursor is not a grant; nothing here can widen what you can see.
 *
 * Body: { last_read_at?: string } — omitted means now. Callers pass the
 * `date_created` of the newest message they have rendered, so the cursor
 * acknowledges an actual row rather than a wall-clock guess. The cursor is
 * monotonic; see the comment on `lastReadAt` below for why that, and not a
 * future-timestamp clamp, is the rule that holds.
 */

import { readItems, createItem, updateItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, "channel");
  if (!channelId) throw createError({ statusCode: 400, message: "channel is required" });

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
        fields: ["id", "last_read_at"],
        limit: 1,
      })
    )) as any[]
  )[0];

  if (!existing) {
    // No row → no membership grant, so fall back to the org-wide read the
    // channel would have been visible under. A private channel has no such
    // path: without a row there is nothing to mark read.
    const orgWide =
      !!orgId &&
      channel.is_private !== true &&
      ((await checkAdminAccess(event, orgId)).isAdmin ||
        (await isActiveBoardMember(directus, userId, orgId)));
    if (!orgWide) throw createError({ statusCode: 403, message: "Not a member of this channel" });
  }

  const body = await readBody(event).catch(() => ({} as any));
  const raw = typeof body?.last_read_at === "string" ? body.last_read_at : null;
  // Monotonic — see `nextReadCursor`, which is where that rule and the reason
  // for it live.
  const lastReadAt = nextReadCursor(existing?.last_read_at, raw);

  if (existing) {
    if (lastReadAt !== existing.last_read_at) {
      await directus.request(
        updateItem("hoa_channel_members", existing.id, { last_read_at: lastReadAt })
      );
    }
  } else {
    await directus.request(
      createItem("hoa_channel_members", {
        channel: channelId,
        user: userId,
        role: "member",
        last_read_at: lastReadAt,
      })
    );
  }

  return { ok: true, channel: channelId, last_read_at: lastReadAt };
});
