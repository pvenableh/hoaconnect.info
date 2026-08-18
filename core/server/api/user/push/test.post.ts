/**
 * POST /api/user/push/test
 *
 * Send the signed-in member a push, so enabling notifications can be confirmed
 * rather than hoped for — the single most common support question about web
 * push is "did that actually work?".
 *
 * Deliberately bypasses category preferences: the member asked for this one
 * explicitly by tapping the button, so it isn't a category they can have muted.
 * It cannot be aimed at anyone else — the recipient is always the session user.
 */
import { sendPushToUser } from "../../../utils/push";
import { safeRequestOrigin } from "../../../utils/origin";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  const origin = await safeRequestOrigin(event);
  const sent = await sendPushToUser(userId, {
    title: "Notifications are on",
    body: "This is what an HOA Connect notification looks like.",
    url: origin || "/",
    tag: "push-test",
  });

  return { sent };
});
