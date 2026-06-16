import { updateItem } from "@directus/sdk";

/**
 * Soft-delete a channel. Sets status='deleted', which hides the channel
 * everywhere in the app but PRESERVES the row and all its messages, comments and
 * reactions — so an admin can't permanently erase important history. Recovery is
 * possible by an operator via Directus. Authorized for org admins, active board
 * members, or a channel admin.
 *
 * Body: { channel }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { channel } = body || {};

  if (!channel) {
    throw createError({ statusCode: 400, message: "channel is required" });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  await requireChannelManager(event, directus, userId, channel);

  const updated = await directus.request(
    updateItem("hoa_channels", channel, { status: "deleted" })
  );

  return { channel: updated };
});
