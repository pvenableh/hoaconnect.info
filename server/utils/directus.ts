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
export async function getUserDirectus(event: any, forceRefresh: boolean = false) {
  const config = useRuntimeConfig();
  console.log('[getUserDirectus] Starting...');

  let session = await getUserSession(event);
  console.log('[getUserDirectus] Session retrieved:', !!session);
  console.log('[getUserDirectus] Session user:', session?.user?.email);

  // Check if session exists
  if (!session || !session.user) {
    console.error('[getUserDirectus] No active session found');
    throw createError({
      statusCode: 401,
      statusMessage: "No active session",
    });
  }

  // Access token from secure section
  let accessToken = getSessionAccessToken(session);
  const refreshToken = getSessionRefreshToken(session);

  console.log('[getUserDirectus] Access token exists:', !!accessToken);
  console.log('[getUserDirectus] Refresh token exists:', !!refreshToken);
  console.log('[getUserDirectus] Access token (first 20 chars):', accessToken?.substring(0, 20));

  if (!accessToken) {
    console.error('[getUserDirectus] No access token available');
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

  console.log('[getUserDirectus] Token check - now:', now, 'expiresAt:', expiresAt, 'isExpired:', isExpired, 'isExpiringSoon:', isExpiringSoon, 'forceRefresh:', forceRefresh);

  if ((isExpired || isExpiringSoon || forceRefresh) && refreshToken) {
    try {
      console.log('[getUserDirectus] Token expired or expiring soon, refreshing...');

      // Create client with authentication to refresh token
      const directus = createDirectus(config.directus.url)
        .with(rest())
        .with(authentication("json"));

      // Refresh the token with explicit mode and refresh token
      const authResult = await directus.request(refresh({ mode: 'json', refresh_token: refreshToken }));

      if (!authResult.access_token) {
        throw new Error("Token refresh failed - no access token returned");
      }

      // Update session with new tokens
      await setUserSession(event, {
        ...session,
        expiresAt: Date.now() + ((authResult.expires || 900) * 1000), // Convert seconds to milliseconds
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

  console.log('[getUserDirectus] Creating client with token');
  console.log('[getUserDirectus] Directus URL:', config.directus.url);

  const client = createDirectus<DirectusSchema>(config.directus.url)
    .with(staticToken(accessToken))
    .with(rest());

  console.log('[getUserDirectus] Client created successfully');
  return client;
}

export const getPublicDirectus = () => {
  const config = useRuntimeConfig();

  return createDirectus<DirectusSchema>(config.directus.url).with(rest());
};
