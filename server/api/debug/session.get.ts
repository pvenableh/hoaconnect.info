export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);

    if (!session || !session.user) {
      return {
        authenticated: false,
        message: "No session found",
      };
    }

    // Check if we have the Directus tokens in the secure section
    const hasAccessToken = !!(session as any).secure?.directusAccessToken;
    const hasRefreshToken = !!(session as any).secure?.directusRefreshToken;

    return {
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
      },
      tokens: {
        hasAccessToken,
        hasRefreshToken,
        // Don't expose the actual tokens for security
      },
      sessionInfo: {
        loggedInAt: session.loggedInAt,
        expiresAt: session.expiresAt,
        isExpired: session.expiresAt ? Date.now() > session.expiresAt : false,
      },
    };
  } catch (error: any) {
    return {
      error: true,
      message: error.message || "Failed to fetch session",
    };
  }
});
