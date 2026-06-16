import { updateItem } from "@directus/sdk";

/**
 * Archive or unarchive a channel (Phase 8 follow-up).
 *
 * Sets hoa_channels.status to 'archived' or 'published'. Archived channels drop
 * out of the main sidebar list (which filters status=published) and appear under
 * a collapsible "Archived" section. Authorized for org admins, active board
 * members, or a channel admin (board members are HOA Member role and can't
 * update channels via row policy, so this goes through the elevated client).
 *
 * Body: { channel, archived: boolean }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { channel, archived } = body || {};

  if (!channel || typeof archived !== "boolean") {
    throw createError({
      statusCode: 400,
      message: "channel and archived (boolean) are required",
    });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  await requireChannelManager(event, directus, userId, channel);

  const updated = await directus.request(
    updateItem("hoa_channels", channel, {
      status: archived ? "archived" : "published",
    })
  );

  return { channel: updated };
});
