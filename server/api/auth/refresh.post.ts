// server/api/auth/refresh.post.ts
import { createDirectus, rest, authentication, refresh } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);
    const refreshToken = (session as any).secure?.directusRefreshToken;

    if (!session || !refreshToken) {
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
    await directus.setToken(refreshToken);

    // Refresh (no arguments)
    const authResult = await directus.request(refresh());

    if (!authResult.access_token) {
      throw new Error("Token refresh failed");
    }

    // Update session with new tokens
    await setUserSession(event, {
      ...session,
      expiresAt: Date.now() + (authResult.expires || 900000),
      secure: {
        directusAccessToken: authResult.access_token,
        directusRefreshToken: authResult.refresh_token || refreshToken,
      },
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
