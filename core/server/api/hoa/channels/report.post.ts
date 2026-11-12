// POST /api/hoa/channels/report — flag a channel message for moderator review.
// Any member who can READ the channel may report (unlike hide/remove, which are
// manager-gated). Records a 'report' row in hoa_channel_moderation_log with the
// reporter as `moderator`; the message itself is untouched. A manager reviews via
// the moderation-log route + can then hide/remove.
//
// Authorization is the same shape as `[channel]/read.post.ts`: your own
// channel-member row, or a non-private channel in a community you administer or
// sit on the board of. It runs BEFORE the message is read — the route writes on
// the admin client, so without it anyone signed in could drop rows (with a
// message snippet) into another community's moderation log, and the 404/200
// would say whether a message id exists there.
// Body: { channel, messageId, reason? }

import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { channel, messageId, reason } = body || {};
  if (!channel || !messageId) {
    throw createError({ statusCode: 400, message: "channel and messageId are required" });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  const ch = (
    (await directus.request(
      readItems("hoa_channels", {
        filter: { id: { _eq: channel } },
        fields: ["id", "organization", "is_private", "status"],
        limit: 1,
      })
    )) as any[]
  )[0];
  if (!ch || ch.status === "deleted") {
    throw createError({ statusCode: 404, message: "Channel not found" });
  }
  const orgId: string | null =
    typeof ch.organization === "string" ? ch.organization : (ch.organization?.id ?? null);

  const mine = (await directus.request(
    readItems("hoa_channel_members", {
      filter: { channel: { _eq: channel }, user: { _eq: userId } },
      fields: ["id"],
      limit: 1,
    })
  )) as any[];
  if (!mine?.length) {
    const orgWide =
      !!orgId &&
      ch.is_private !== true &&
      ((await checkAdminAccess(event, orgId)).isAdmin ||
        (await isActiveBoardMember(directus, userId, orgId)));
    if (!orgWide) throw createError({ statusCode: 403, message: "Not a member of this channel" });
  }

  // Verify the message exists in the given channel (scopes the report + gives us
  // the author for the log).
  let msg: any = null;
  try {
    const rows = (await directus.request(
      readItems("hoa_channel_messages", {
        filter: { id: { _eq: messageId }, channel: { _eq: channel } },
        fields: ["id", "content", { user_created: ["id"] }],
        limit: 1,
      })
    )) as any[];
    msg = rows?.[0] ?? null;
  } catch {
    /* best-effort */
  }
  if (!msg) throw createError({ statusCode: 404, message: "Message not found in this channel" });

  const authorId = typeof msg?.user_created === "object" ? msg.user_created?.id : msg?.user_created;

  await logChannelModeration({
    organization: orgId,
    channel,
    moderator: userId, // the reporter
    action: "report",
    reason: reason || null,
    messageId,
    messageAuthor: authorId || null,
    messageContent: msg?.content || null,
  });

  return { ok: true };
});
