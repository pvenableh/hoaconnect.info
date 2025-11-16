import { createDirectus, rest, authentication, refresh } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    // Get the current session
    const session = await getUserSession(event);

    if (!session || !session.directusRefreshToken) {
      throw createError({
        statusCode: 401,
        statusMessage: "No refresh token available",
      });
    }

    const config = useRuntimeConfig();

    // Create client
    const directus = createDirectus(config.public.directus.url)
      .with(rest())
      .with(authentication("json"));

    // Refresh the token
    const authResult = await directus.request(
      refresh("json", session.directusRefreshToken)
    );

    if (!authResult.access_token) {
      throw new Error("Token refresh failed");
    }

    // Update session with new tokens
    await setUserSession(event, {
      ...session,
      directusAccessToken: authResult.access_token,
      directusRefreshToken:
        authResult.refresh_token || session.directusRefreshToken,
      expiresAt: Date.now() + (authResult.expires || 900000),
    });

    return {
      success: true,
      message: "Token refreshed successfully",
    };
  } catch (error: any) {
    console.error("Token refresh error:", error);

    // Clear session if refresh fails
    await clearUserSession(event);

    throw createError({
      statusCode: 401,
      statusMessage: "Failed to refresh token",
    });
  }
});
