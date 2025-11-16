// server/api/auth/refresh.post.ts
import { createDirectus, rest, authentication, refresh } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);

    if (!session || !session.directusRefreshToken) {
      throw createError({
        statusCode: 401,
        statusMessage: "No refresh token available",
      });
    }

    const config = useRuntimeConfig();

    // Create client with authentication
    const directus = createDirectus(config.public.directus.url)
      .with(rest())
      .with(authentication("json"));

    // Set the refresh token
    await directus.setToken(session.directusRefreshToken);

    // Refresh (no arguments)
    const authResult = await directus.request(refresh());

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
    await clearUserSession(event);

    throw createError({
      statusCode: 401,
      statusMessage: "Failed to refresh token",
    });
  }
});
