// server/api/websocket/token.get.ts
/**
 * WebSocket Token Endpoint
 * Returns the current user's access token for WebSocket authentication
 */

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if (!session?.secure?.directusAccessToken) {
    throw createError({
      statusCode: 401,
      message: "Not authenticated",
    });
  }

  // Check if token is about to expire (within 60 seconds)
  const now = Date.now();
  const expiresAt = session.expiresAt || 0;

  if (expiresAt - now < 60000 && session.secure.directusRefreshToken) {
    try {
      // Refresh the token before returning
      const tokens = await directusRefresh(session.secure.directusRefreshToken);

      // Update session with new tokens
      await setUserSession(event, {
        ...session,
        expiresAt: Date.now() + tokens.expires * 1000,
        secure: {
          directusAccessToken: tokens.access_token,
          directusRefreshToken: tokens.refresh_token,
        },
      });

      return { token: tokens.access_token };
    } catch {
      throw createError({
        statusCode: 401,
        message: "Session expired - please log in again",
      });
    }
  }

  return { token: session.secure.directusAccessToken };
});
