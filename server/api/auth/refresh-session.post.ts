/**
 * Server API route to refresh the user session with fresh data from Directus
 * POST: Refresh user session
 */

import {
  createDirectus,
  rest,
  staticToken,
  readMe,
} from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);

    if (!session?.secure?.directusAccessToken) {
      throw createError({
        statusCode: 401,
        statusMessage: "Not authenticated",
      });
    }

    const config = useRuntimeConfig();

    // Create an authenticated client to fetch fresh user data
    const authClient = createDirectus(config.directus.url)
      .with(staticToken(session.secure.directusAccessToken))
      .with(rest());

    // Fetch fresh user data
    const user = await authClient.request(
      readMe({
        fields: ["*", "role", { organization: ["id", "slug", "name", "custom_domain", "domain_verified"] }],
      })
    );

    // Extract avatar ID (can be string or object with id)
    const avatarId = typeof user.avatar === 'string' ? user.avatar : user.avatar?.id || null;

    // Update user session with fresh data
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        avatar: avatarId,
        role: user.role,
        organization: user.organization,
        provider: session.user?.provider || "local",
      },
      loggedInAt: session.loggedInAt,
      expiresAt: session.expiresAt,
      selectedOrgId: session.selectedOrgId,
      secure: session.secure,
    });

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        avatar: avatarId,
        role: user.role,
        organization: user.organization,
      },
    };
  } catch (error: any) {
    console.error("Session refresh error:", error);

    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || "Failed to refresh session",
    });
  }
});
