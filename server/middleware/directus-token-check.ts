/**
 * Server middleware to ensure authenticated users have Directus tokens in their session.
 *
 * The /api/directus/* proxy requires session.secure.directusAccessToken to authenticate
 * API requests to Directus. If a user has a session but is missing these tokens (from
 * an old session or incomplete authentication), this middleware logs a warning for debugging.
 *
 * The actual 401 errors will be handled by the /api/directus/* proxy and trigger the
 * token refresh flow automatically.
 */
export default defineEventHandler(async (event) => {
  // Skip for public routes and auth endpoints
  const path = event.node.req.url || "";

  // Allow these paths without token check
  const allowedPaths = [
    "/api/auth/",
    "/api/hoa/setup-organization",
    "/api/hoa/accept-invitation",
    "/api/hoa/verify-invitation",
    "/api/hoa/invite-member",
    "/api/hoa/check-slug",
    "/api/hoa/by-slug",
    "/api/hoa/by-domain",
    "/api/vercel/",
    "/api/debug/",
    "/_nuxt/",
    "/favicon.ico",
  ];

  if (allowedPaths.some((allowed) => path.startsWith(allowed))) {
    return;
  }

  try {
    const session = await getUserSession(event);

    // If user is logged in but making API calls to Directus without tokens, log warning
    if (session?.user && path.startsWith("/api/directus/")) {
      const hasAccessToken = !!(session as any).secure?.directusAccessToken;

      if (!hasAccessToken) {
        console.warn(
          `[Token Check] User ${session.user.email} attempted ${path} without Directus tokens. ` +
          `This request will fail with 401. User may need to log out and log back in.`
        );
      }
    }
  } catch (error: any) {
    console.error("[Token Check] Error checking session:", error);
  }
});
