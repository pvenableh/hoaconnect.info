import { updateItem } from "@directus/sdk";

/**
 * Pin or unpin a channel (org-wide). Pinned channels float to the top of the
 * sidebar. Authorized for org admins, active board members, or a channel admin
 * (board members can't update channels via row policy → elevated route).
 *
 * Body: { channel, pinned: boolean }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { channel, pinned } = body || {};

  if (!channel || typeof pinned !== "boolean") {
    throw createError({
      statusCode: 400,
      message: "channel and pinned (boolean) are required",
    });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  await requireChannelManager(event, directus, userId, channel);

  const updated = await directus.request(
    updateItem("hoa_channels", channel, { is_pinned: pinned })
  );

  return { channel: updated };
});
