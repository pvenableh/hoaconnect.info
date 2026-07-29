// POST /api/hoa/channels/report — flag a channel message for moderator review.
// Any authenticated member may report (unlike hide/remove, which are manager-
// gated). Records a 'report' row in hoa_channel_moderation_log with the reporter
// as `moderator`; the message itself is untouched. A manager reviews via the
// moderation-log route + can then hide/remove.
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

  // Verify the message exists in the given channel (scopes the report + gives us
  // the org + author for the log).
  let msg: any = null;
  try {
    const rows = (await directus.request(
      readItems("hoa_channel_messages", {
        filter: { id: { _eq: messageId }, channel: { _eq: channel } },
        fields: ["id", "content", { user_created: ["id"] }, { channel: [{ organization: ["id"] }] }],
        limit: 1,
      })
    )) as any[];
    msg = rows?.[0] ?? null;
  } catch {
    /* best-effort */
  }
  if (!msg) throw createError({ statusCode: 404, message: "Message not found in this channel" });

  const orgId = msg?.channel?.organization?.id ?? null;
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
