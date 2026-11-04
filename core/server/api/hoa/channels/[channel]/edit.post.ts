/**
 * POST /api/hoa/channels/:channel/edit
 *
 * Edit a channel message. Messages are CREATED straight from the browser, but
 * EDITS go through here so the rule is enforced where it can't be skipped:
 *
 *   - the author may edit their own message for 15 minutes (`EDIT_WINDOW_MS`);
 *   - a channel manager (org admin / active board / channel admin) has no
 *     window, and may also correct another member's message — that is a
 *     moderation act, so it writes a `hoa_channel_moderation_log` row;
 *   - nobody else may.
 *
 * The browser's Directus `update` permission on `hoa_channel_messages` is
 * narrowed away by `pnpm add:channel-phase7`; until that runs a hand-made API
 * call can still skip this route, which is why the script is part of the phase.
 *
 * Sets `is_edited` and `edited_at`. If `edited_at` doesn't exist yet (the script
 * hasn't run) the write retries without it rather than failing the edit.
 *
 * Body: { messageId, content }
 */

import { readItems, updateItem } from "@directus/sdk";
import { checkEditAllowed } from "#core/shared/channels/rules";

const MAX_CONTENT = 20_000;

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, "channel");
  const body = await readBody(event).catch(() => ({}) as any);
  const messageId = String(body?.messageId ?? "").trim();
  const content = typeof body?.content === "string" ? body.content : "";
  if (!channelId || !messageId) {
    throw createError({ statusCode: 400, message: "channel and messageId are required" });
  }
  if (content.length > MAX_CONTENT) {
    throw createError({ statusCode: 400, message: "Message is too long" });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  // Scoped to the channel so a foreign id can't be targeted through a channel
  // the caller can manage.
  const msg = (
    (await directus.request(
      readItems("hoa_channel_messages", {
        filter: { id: { _eq: messageId }, channel: { _eq: channelId } },
        fields: [
          "id",
          "content",
          "status",
          "date_created",
          "attachments",
          { user_created: ["id"] },
          { channel: [{ organization: ["id"] }] },
        ],
        limit: 1,
      })
    )) as any[]
  )[0];
  if (!msg) throw createError({ statusCode: 404, message: "Message not found in this channel" });

  const authorId = typeof msg.user_created === "object" ? msg.user_created?.id : msg.user_created;
  const orgId = msg?.channel?.organization?.id ?? null;
  const hasAttachments = Array.isArray(msg.attachments) && msg.attachments.length > 0;
  if (!stripHtml(content) && !hasAttachments) {
    throw createError({ statusCode: 400, message: "A message can't be empty" });
  }

  // Manager? requireChannelManager throws 403 for "no" and 404 for a missing
  // channel — only the 403 means "just a member".
  let isManager = false;
  try {
    await requireChannelManager(event, directus, userId, channelId);
    isManager = true;
  } catch (e: any) {
    if (e?.statusCode !== 403) throw e;
  }

  const verdict = checkEditAllowed({
    isAuthor: authorId === userId,
    isManager,
    createdAt: msg.date_created,
    now: new Date(),
    status: msg.status,
  });
  if ("reason" in verdict) {
    const message =
      verdict.reason === "window_closed"
        ? "Messages can only be edited for 15 minutes after they are sent"
        : verdict.reason === "not_yours"
          ? "You can only edit your own messages"
          : "This message can't be edited";
    throw createError({ statusCode: verdict.status, message });
  }

  if (content === msg.content) return { ok: true, unchanged: true };

  const editedAt = new Date().toISOString();
  try {
    await directus.request(
      updateItem("hoa_channel_messages", messageId, {
        content,
        is_edited: true,
        edited_at: editedAt,
      } as any)
    );
  } catch (e: any) {
    // `edited_at` not migrated yet — keep the edit, lose only the timestamp.
    console.warn("[channels/edit] retrying without edited_at:", e?.message || e);
    await directus.request(
      updateItem("hoa_channel_messages", messageId, { content, is_edited: true } as any)
    );
  }

  if ("moderated" in verdict && verdict.moderated) {
    await logChannelModeration({
      organization: orgId,
      channel: channelId,
      moderator: userId,
      action: "edit",
      reason: null,
      messageId,
      messageAuthor: authorId || null,
      // The text as it stood BEFORE the manager changed it — the audit value.
      messageContent: msg.content || null,
    });
  }

  return { ok: true, edited_at: editedAt, moderated: verdict.moderated };
});
