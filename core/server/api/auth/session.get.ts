/**
 * GET /api/auth/session
 *
 * The current user session, without any token. It used to return the Directus
 * access token for a browser WebSocket to Directus; realtime now polls
 * `/api/realtime/poll`, and no route hands a Directus token to the browser
 * (with one, a user could call Directus directly, past every app route).
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if (!session || !session.user) {
    return { authenticated: false, user: null };
  }

  return {
    authenticated: true,
    user: session.user,
    loggedInAt: session.loggedInAt,
    expiresAt: session.expiresAt,
  };
});
