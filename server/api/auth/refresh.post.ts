import { authentication, rest, readMe, refresh } from "@directus/sdk";
import { createDirectus } from "@directus/sdk";

/**
 * Custom token refresh endpoint.
 *
 * Refreshes the Directus access token using the refresh token stored in the session.
 * This is called automatically by the /api/directus/* proxy when it receives a 401.
 */
export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);

    if (!session || !session.user) {
      throw createError({
        statusCode: 401,
        message: "Not authenticated",
      });
    }

    const refreshToken = (session as any).secure?.directusRefreshToken;

    if (!refreshToken) {
      throw createError({
        statusCode: 401,
        message: "No refresh token found. Please log in again.",
      });
    }

    const config = useRuntimeConfig();

    // Create Directus client
    const directus = createDirectus(config.directus.url)
      .with(authentication("json"))
      .with(rest());

    // Refresh the token
    const authResult = await directus.refresh();

    if (!authResult.access_token || !authResult.refresh_token) {
      throw createError({
        statusCode: 500,
        message: "Token refresh failed",
      });
    }

    // Get updated user details
    const user = await directus.request(readMe());

    // Update session with new tokens
    await setUserSession(
      event,
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: typeof user.role === "object" ? user.role.id : user.role,
          provider: session.user.provider || "local",
        },
        loggedInAt: session.loggedInAt || Date.now(),
        expiresAt: Date.now() + authResult.expires * 1000, // Convert to milliseconds
      },
      {
        secure: {
          directusAccessToken: authResult.access_token,
          directusRefreshToken: authResult.refresh_token,
        },
      }
    );

    return {
      success: true,
      expiresAt: Date.now() + authResult.expires * 1000,
    };
  } catch (error: any) {
    console.error("Token refresh error:", error);

    // Clear the session if refresh fails
    await clearUserSession(event);

    throw createError({
      statusCode: 401,
      message: "Session expired. Please log in again.",
    });
  }
});
