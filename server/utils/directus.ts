import {
  createDirectus,
  rest,
  authentication,
  staticToken,
  refresh,
} from "@directus/sdk";
import type { DirectusSchema } from "~/types/directus-schema";

/**
 * Get a typed Directus client with admin access
 * Uses static token for server-side operations
 */
export function getTypedDirectus() {
  const config = useRuntimeConfig();

  const client = createDirectus<DirectusSchema>(config.directus.url)
    .with(staticToken(config.directus.staticToken))
    .with(rest());

  return client;
}

/**
 * Get a Directus client with user authentication
 * Uses the session token from nuxt-auth-utils
 * Automatically refreshes expired tokens
 */
export async function getUserDirectus(event: any) {
  const config = useRuntimeConfig();
  let session = await getUserSession(event);

  // Check if session exists
  if (!session || !session.user) {
    throw createError({
      statusCode: 401,
      statusMessage: "No active session",
    });
  }

  // Access token from secure section
  let accessToken = getSessionAccessToken(session);
  const refreshToken = getSessionRefreshToken(session);

  if (!accessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: "No authentication token available",
    });
  }

  // Check if token is expired or about to expire (within 1 minute)
  const now = Date.now();
  const expiresAt = session.expiresAt || 0;
  const isExpired = expiresAt <= now;
  const isExpiringSoon = expiresAt - now < 60000; // 1 minute buffer

  if ((isExpired || isExpiringSoon) && refreshToken) {
    try {
      console.log('[getUserDirectus] Token expired or expiring soon, refreshing...');

      // Create client with authentication to refresh token
      const directus = createDirectus(config.public.directus.url)
        .with(rest())
        .with(authentication("json"));

      // Refresh the token with explicit mode and refresh token
      const authResult = await directus.request(refresh('json', refreshToken));

      if (!authResult.access_token) {
        throw new Error("Token refresh failed - no access token returned");
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

      // Use the new access token
      accessToken = authResult.access_token;

      console.log('[getUserDirectus] Token refreshed successfully');
    } catch (error: any) {
      console.error('[getUserDirectus] Token refresh failed:', error);

      // Clear session on refresh failure
      await clearUserSession(event);

      throw createError({
        statusCode: 401,
        statusMessage: "Session expired - please log in again",
      });
    }
  }

  const client = createDirectus<DirectusSchema>(config.directus.url)
    .with(staticToken(accessToken))
    .with(rest());

  return client;
}

export const getPublicDirectus = () => {
  const config = useRuntimeConfig();

  return createDirectus<DirectusSchema>(config.directus.url).with(rest());
};
