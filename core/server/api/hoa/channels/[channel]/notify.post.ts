/**
 * POST /api/hoa/channels/:channel/notify
 *
 * The server moment a browser-created channel message doesn't otherwise have.
 * The client says only "I posted message X"; the audience, the copy and the
 * suppression (muted, channel-open, @-mentioned, the author) are decided in
 * `notifyChannelMessage`. The caller can only trigger the fan-out for their own,
 * recent, published message, once — see that util.
 *
 * Fire-and-forget from the client: "nothing to say" outcomes answer 200 with
 * `ok: false` and a reason.
 *
 * Body: { messageId }
 */
export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, "channel");
  const body = await readBody(event).catch(() => ({}) as any);
  const messageId = String(body?.messageId ?? "").trim();
  if (!channelId || !messageId) {
    throw createError({ statusCode: 400, message: "channel and messageId are required" });
  }
  const { userId } = await requireAuthenticatedUser(event);
  return await notifyChannelMessage({
    directus: getTypedDirectus(),
    channelId,
    messageId,
    actorId: userId,
    origin: await safeRequestOrigin(event),
  });
});
