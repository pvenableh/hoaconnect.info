import { readItem, deleteItem } from "@directus/sdk";

/**
 * Remove a member from a channel (Phase 8, Track C).
 *
 * Deletes a hoa_channel_members row (revoking that user's access to the channel).
 * Authorized for org admins, active board members, or a channel admin.
 *
 * Body: { id }  // the hoa_channel_members row id
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const id = body?.id;
  if (!id) {
    throw createError({ statusCode: 400, message: "id is required" });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  // Resolve the membership's channel, then authorize against it.
  let membership: any;
  try {
    membership = await directus.request(
      readItem("hoa_channel_members", id, { fields: ["id", "channel"] })
    );
  } catch {
    throw createError({ statusCode: 404, message: "Membership not found" });
  }
  const channelId =
    typeof membership.channel === "string" ? membership.channel : membership.channel?.id;

  await requireChannelManager(event, directus, userId, channelId);

  await directus.request(deleteItem("hoa_channel_members", id));

  return { removed: true };
});
