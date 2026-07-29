// POST /api/hoa/channels/moderate — hide or remove a channel message.
// Manager-gated (org admin / active board / channel admin). Channel messages'
// Directus delete permission is author-only, so this goes through the elevated
// client. Both actions snapshot the message into hoa_channel_moderation_log.
//   hide   → soft: status 'deleted' + a tombstone (recoverable in Directus)
//   remove → hard delete
// Body: { channel, messageId, action: 'hide'|'remove', reason? }

import { readItems, updateItem, deleteItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { channel, messageId, action, reason } = body || {};
  if (!channel || !messageId || (action !== "hide" && action !== "remove")) {
    throw createError({ statusCode: 400, message: "channel, messageId, action('hide'|'remove') are required" });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();
  await requireChannelManager(event, directus, userId, channel);

  // Snapshot the message (author + content + org) for the audit log before we
  // mutate/delete it. Scoped to the channel so a foreign id can't be targeted.
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
    /* best-effort snapshot */
  }
  if (!msg) throw createError({ statusCode: 404, message: "Message not found in this channel" });

  const orgId = msg?.channel?.organization?.id ?? null;
  const authorId = typeof msg?.user_created === "object" ? msg.user_created?.id : msg?.user_created;

  if (action === "hide") {
    await directus.request(
      updateItem("hoa_channel_messages", messageId, {
        status: "deleted",
        content: "<em>This message was hidden by a moderator.</em>",
      } as any)
    );
  } else {
    await directus.request(deleteItem("hoa_channel_messages", messageId));
  }

  await logChannelModeration({
    organization: orgId,
    channel,
    moderator: userId,
    action,
    reason: reason || null,
    messageId,
    messageAuthor: authorId || null,
    messageContent: msg?.content || null,
  });

  return { ok: true, action };
});
