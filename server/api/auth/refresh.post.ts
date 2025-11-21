// server/api/auth/refresh.post.ts
import { createDirectus, rest, authentication, refresh } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  console.log('[refresh] Token refresh request received');

  try {
    const session = await getUserSession(event);
    const refreshToken = getSessionRefreshToken(session);

    console.log('[refresh] Session exists:', !!session);
    console.log('[refresh] Refresh token exists:', !!refreshToken);

    if (!session || !refreshToken) {
      console.error('[refresh] No session or refresh token available');
      throw createError({
        statusCode: 401,
        statusMessage: "No refresh token available",
      });
    }

    // Check current token expiration
    const currentExpiresAt = session.expiresAt;
    const now = Date.now();
    const minutesUntilExpiry = currentExpiresAt ? Math.floor((currentExpiresAt - now) / 60000) : 0;

    console.log('[refresh] Current token expires in:', minutesUntilExpiry, 'minutes');

    const config = useRuntimeConfig();

    // Create client with authentication
    const directus = createDirectus(config.directus.url)
      .with(rest())
      .with(authentication("json"));

    // Refresh with explicit mode and refresh token
    console.log('[refresh] Calling Directus refresh endpoint...');
    const authResult = await directus.request(refresh({ mode: 'json', refresh_token: refreshToken }));

    if (!authResult.access_token) {
      throw new Error("Token refresh failed - no access token returned");
    }

    // Calculate new expiration time
    const expiresInSeconds = authResult.expires || 900;
    const newExpiresAt = Date.now() + (expiresInSeconds * 1000);
    const newMinutesUntilExpiry = Math.floor(expiresInSeconds / 60);

    console.log('[refresh] New token expires in:', newMinutesUntilExpiry, 'minutes');

    // Update session with new tokens
    await setUserSession(event, {
      ...session,
      expiresAt: newExpiresAt,
      secure: {
        directusAccessToken: authResult.access_token,
        directusRefreshToken: authResult.refresh_token || refreshToken,
      },
    });

    console.log('[refresh] Token refreshed successfully');

    return {
      success: true,
      message: "Token refreshed successfully",
      expiresIn: expiresInSeconds,
    };
  } catch (error: any) {
    console.error("[refresh] Token refresh error:", error.message || error);

    // Clear session on refresh failure
    await clearUserSession(event);

    throw createError({
      statusCode: 401,
      statusMessage: error.message || "Failed to refresh token",
    });
  }
});
