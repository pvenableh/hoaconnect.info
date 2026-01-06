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
} from "@directus/sdk";
import type { H3Event } from "h3";
import type { Schema } from "~~/types/directus";

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

  const result = await client.login(email, password);
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

  await client.logout(refreshToken);
}

/**
 * Get current user data using access token
 */
export async function directusGetMe(
  accessToken: string,
  fields?: string[]
) {
  const config = useRuntimeConfig();
  const client = createDirectus<Schema>(config.directus.url)
    .with(staticToken(accessToken))
    .with(rest());

  return await client.request(readMe({ fields: fields || ["*"] }));
}
