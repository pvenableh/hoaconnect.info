/**
 * GET /api/user/push/config
 *
 * Whether web push is configured in this environment, and the public VAPID key
 * the browser needs to subscribe. With no keys set this returns
 * `{ enabled: false, publicKey: "" }` and the client hides the feature — which
 * is the correct state for any deployment that hasn't been given keys, rather
 * than an error.
 *
 * The public key is public by definition (it ships to every browser that
 * subscribes); the private key never leaves the server.
 */
import { pushConfigured, vapidPublicKey } from "../../../utils/push";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }
  return { enabled: pushConfigured(), publicKey: vapidPublicKey() };
});
