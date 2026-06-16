// server/utils/session.ts

/**
 * Get Directus access token from session
 */
export function getSessionAccessToken(session: any): string | undefined {
  return session?.secure?.directusAccessToken;
}

/**
 * Get Directus refresh token from session
 */
export function getSessionRefreshToken(session: any): string | undefined {
  return session?.secure?.directusRefreshToken;
}
