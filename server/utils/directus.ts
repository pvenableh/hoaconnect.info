// server/utils/directus.ts
// Server-side Directus clients with automatic token refresh

import {
  createDirectus,
  rest,
  authentication,
  staticToken,
  refresh,
} from "@directus/sdk";
import type { H3Event } from "h3";
import type { DirectusSchema } from "~~/types/directus";

/**
 * Get a typed Directus client with admin access
 * Uses static token for server-side operations
 */
export function getTypedDirectus() {
  const config = useRuntimeConfig();

  return createDirectus<DirectusSchema>(config.directus.url)
    .with(staticToken(config.directus.staticToken))
    .with(rest());
}

/**
 * Get a Directus client with user authentication
 * Uses the session token from nuxt-auth-utils
 * Automatically refreshes expired tokens
 */
export async function getUserDirectus(
  event: H3Event,
  forceRefresh: boolean = false
) {
  const config = useRuntimeConfig();

  const session = await getUserSession(event);

  // Check if session exists
  if (!session?.user) {
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

  // Check if token is expired or about to expire (within 60 seconds)
  const now = Date.now();
  const expiresAt = session.expiresAt || 0;
  const needsRefresh = forceRefresh || expiresAt - now < 60000;

  // If token needs refresh but no refresh token is available, clear session
  if (needsRefresh && !refreshToken) {
    await clearUserSession(event);
    throw createError({
      statusCode: 401,
      statusMessage: "Session expired - please log in again",
    });
  }

  // Refresh token if needed
  if (needsRefresh && refreshToken) {
    try {
      const directus = createDirectus(config.directus.url)
        .with(rest())
        .with(authentication("json"));

      const authResult = await directus.request(
        refresh({ mode: "json", refresh_token: refreshToken })
      );

      if (!authResult.access_token) {
        throw new Error("Token refresh failed - no access token returned");
      }

      // Update session with new tokens
      await setUserSession(event, {
        ...session,
        expiresAt: Date.now() + (authResult.expires || 900) * 1000,
        secure: {
          directusAccessToken: authResult.access_token,
          directusRefreshToken: authResult.refresh_token || refreshToken,
        },
      });

      accessToken = authResult.access_token;
    } catch (error) {
      await clearUserSession(event);
      throw createError({
        statusCode: 401,
        statusMessage: "Session expired - please log in again",
      });
    }
  }

  return createDirectus<DirectusSchema>(config.directus.url)
    .with(staticToken(accessToken))
    .with(rest());
}

/**
 * Get a public Directus client (no authentication)
 * Use for accessing publicly available data
 */
export function getPublicDirectus() {
  const config = useRuntimeConfig();

  return createDirectus<DirectusSchema>(config.directus.url).with(rest());
}
