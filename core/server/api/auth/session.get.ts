/**
 * GET /api/auth/session
 *
 * Returns the current user session with the Directus access token.
 * This endpoint is needed for client-side WebSocket connections to Directus.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if (!session || !session.user) {
    return {
      authenticated: false,
      user: null,
      secure: null,
    };
  }

  // Return session with secure data for WebSocket authentication
  return {
    authenticated: true,
    user: session.user,
    secure: {
      directusAccessToken: (session as any).secure?.directusAccessToken,
    },
    loggedInAt: session.loggedInAt,
    expiresAt: session.expiresAt,
  };
});
