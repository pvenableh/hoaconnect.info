// server/utils/directus.ts
// Server-side Directus clients with automatic token refresh

import {
  createDirectus,
  rest,
  authentication,
  staticToken,
  refresh,
  readMe,
  readItems,
  readItem,
  createItem,
  createItems,
  updateItem,
  updateItems,
  deleteItem,
  deleteItems,
  readUsers,
  readUser,
  createUser,
  updateUser,
  updateUsers,
  deleteUser,
  deleteUsers,
  uploadFiles,
  importFile,
  readFiles,
  readFile,
  updateFile,
  deleteFile,
  readFolders,
  readFolder,
  createFolder,
  createFolders,
  updateFolder,
  updateFolders,
  deleteFolder,
  deleteFolders,
  readActivities,
  readActivity,
  readNotifications,
  readNotification,
  createNotification,
  createNotifications,
  updateNotification,
  updateNotifications,
  deleteNotification,
  deleteNotifications,
  readRevisions,
  readRevision,
  readPresets,
  readPreset,
  createPreset,
  updatePreset,
  deletePreset,
  readRoles,
  readRole,
  createRole,
  updateRole,
  deleteRole,
  aggregate,
  passwordRequest,
  passwordReset,
  inviteUser,
  acceptUserInvite,
  logout,
} from "@directus/sdk";
import type { Query, DirectusUser as SdkDirectusUser } from "@directus/sdk";
import type { H3Event } from "h3";
import type { Schema } from "#core/types/directus";

// Re-export SDK functions for use in API routes
export {
  readMe,
  readItems, readItem, createItem, createItems, updateItem, updateItems, deleteItem, deleteItems,
  readUsers, readUser, createUser, updateUser, updateUsers, deleteUser, deleteUsers,
  uploadFiles, importFile, readFiles, readFile, updateFile, deleteFile,
  readFolders, readFolder, createFolder, createFolders, updateFolder, updateFolders, deleteFolder, deleteFolders,
  readActivities, readActivity,
  readNotifications, readNotification, createNotification, createNotifications, updateNotification, updateNotifications, deleteNotification, deleteNotifications,
  readRevisions, readRevision,
  readPresets, readPreset, createPreset, updatePreset, deletePreset,
  readRoles, readRole, createRole, updateRole, deleteRole,
  aggregate,
  passwordRequest, passwordReset,
  inviteUser, acceptUserInvite,
};

/**
 * Get a typed Directus client with admin access
 * Uses static token for server-side operations
 */
export function getTypedDirectus() {
  const config = useRuntimeConfig();

  return createDirectus<Schema>(config.directus.url)
    .with(staticToken(config.directus.staticToken))
    .with(rest());
}

// ── Refresh-token rotation dedup ─────────────────────────────────────────────
// Directus rotates the refresh token on every /auth/refresh (single-use). When
// several requests refresh at once with the SAME old token, one wins and the
// rest 401 → the session dies days before its real TTL. dedupedDirectusRefresh
// funnels every refresh for a given token through ONE in-flight call and briefly
// caches the winning result, so siblings reuse it instead of racing. In-process
// only (enough for a single Nitro instance / local dev). Ported from Earnest.
const _inflightRefreshes = new Map<string, Promise<any>>();
const _recentRefreshes = new Map<string, { result: any; at: number }>();
const REFRESH_RESULT_TTL_MS = 10_000;
const REFRESH_TIMEOUT_MS = 8_000;

export async function dedupedDirectusRefresh(refreshToken: string): Promise<any> {
  const cached = _recentRefreshes.get(refreshToken);
  if (cached && Date.now() - cached.at < REFRESH_RESULT_TTL_MS) return cached.result;

  const inflight = _inflightRefreshes.get(refreshToken);
  if (inflight) return inflight;

  const url = useRuntimeConfig().directus.url as string;
  const p = (async () => {
    const directus = createDirectus(url).with(rest()).with(authentication("json"));
    // Bound the refresh so a hung Directus can't wedge every waiting request.
    const result = await Promise.race([
      directus.request(refresh({ mode: "json", refresh_token: refreshToken })),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Directus refresh timed out")), REFRESH_TIMEOUT_MS)
      ),
    ]);
    _recentRefreshes.set(refreshToken, { result, at: Date.now() });
    if (_recentRefreshes.size > 500) _recentRefreshes.clear(); // bound memory
    return result;
  })().finally(() => _inflightRefreshes.delete(refreshToken));

  _inflightRefreshes.set(refreshToken, p);
  return p;
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
  const expiresAt = session.expiresAt;
  // If expiresAt is missing (old session), don't force refresh unless explicitly requested
  // The token will still work and the client-side refresh will eventually set expiresAt
  const needsRefresh = forceRefresh || (expiresAt !== undefined && expiresAt - now < 60000);

  // If a refresh is needed but no refresh token is present, do NOT clear the
  // sealed cookie — a momentarily-missing token or old-shape session would force
  // a logout over a recoverable state. Surface 401 for this request; the client
  // owns teardown. (Earnest §2.)
  if (needsRefresh && !refreshToken) {
    throw createError({
      statusCode: 401,
      statusMessage: "Session refresh unavailable",
    });
  }

  // Refresh token if needed — through the rotation-dedup so concurrent requests
  // reuse the winning rotation instead of racing the single-use token.
  if (needsRefresh && refreshToken) {
    try {
      const authResult: any = await dedupedDirectusRefresh(refreshToken);

      if (!authResult?.access_token) {
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

      accessToken = authResult.access_token as string;
    } catch (error) {
      // Non-destructive: a refresh-token ROTATION RACE (a concurrent request just
      // rotated the token, invalidating ours) or a transient error must NOT clear
      // the session — that would log the user out over a recoverable hiccup. Surface
      // 401 for this one request; a retry, or the request that won the race (and
      // updated the session cookie), keeps the user logged in.
      throw createError({
        statusCode: 401,
        statusMessage: "Could not refresh session",
      });
    }
  }

  return createDirectus<Schema>(config.directus.url)
    .with(staticToken(accessToken))
    .with(rest());
}

/**
 * Get a public Directus client (no authentication)
 * Use for accessing publicly available data
 */
export function getPublicDirectus() {
  const config = useRuntimeConfig();

  return createDirectus<Schema>(config.directus.url).with(rest());
}

// ============================================
// Authentication Helper Functions
// ============================================

interface DirectusTokens {
  access_token: string;
  refresh_token: string;
  expires: number;
}

/**
 * Login user with email and password
 * Returns access and refresh tokens
 */
export async function directusLogin(
  email: string,
  password: string
): Promise<DirectusTokens> {
  const config = useRuntimeConfig();
  const client = createDirectus(config.directus.url)
    .with(authentication("json"))
    .with(rest());

  const result = await client.login({ email, password });
  return result as DirectusTokens;
}

/**
 * Refresh tokens using refresh token
 */
export async function directusRefresh(
  refreshToken: string
): Promise<DirectusTokens> {
  const config = useRuntimeConfig();
  const client = createDirectus(config.directus.url)
    .with(rest())
    .with(authentication("json"));

  const result = await client.request(
    refresh({ mode: "json", refresh_token: refreshToken })
  );
  return result as DirectusTokens;
}

/**
 * Logout user using refresh token
 */
export async function directusLogout(refreshToken: string): Promise<void> {
  const config = useRuntimeConfig();
  const client = createDirectus(config.directus.url)
    .with(authentication("json"))
    .with(rest());

  await client.request(logout({ refresh_token: refreshToken, mode: "json" }));
}

/**
 * Get current user data using access token
 */
export async function directusGetMe(
  accessToken: string,
  fields?: Query<Schema, SdkDirectusUser<Schema>>["fields"]
) {
  const config = useRuntimeConfig();
  const client = createDirectus<Schema>(config.directus.url)
    .with(staticToken(accessToken))
    .with(rest());

  return await client.request(readMe({ fields: fields || ["*"] }));
}
