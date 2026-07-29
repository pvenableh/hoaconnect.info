// GET /api/hoa/channels/moderation-log?channel=… — recent moderation events for
// a channel (hide/remove/report), newest first. Manager-gated. The log has no
// client permissions, so it's read here through the elevated client. Degrades to
// an empty list if the collection isn't present yet (pre-migration).

import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const channel = String(getQuery(event).channel || "").trim();
  if (!channel) throw createError({ statusCode: 400, message: "channel is required" });

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();
  await requireChannelManager(event, directus, userId, channel);

  try {
    const events = await (directus as any).request(
      (readItems as any)("hoa_channel_moderation_log", {
        filter: { channel: { _eq: channel } },
        fields: [
          "id",
          "action",
          "reason",
          "message_id",
          "message_snippet",
          "date_created",
          { moderator: ["id", "first_name", "last_name"] },
          { message_author: ["id", "first_name", "last_name"] },
        ],
        sort: ["-date_created"],
        limit: 50,
      })
    );
    return { events: events ?? [] };
  } catch {
    return { events: [] };
  }
});
