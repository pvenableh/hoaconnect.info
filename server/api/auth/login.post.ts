import { authentication, rest, readMe } from "@directus/sdk";
import { createDirectus } from "@directus/sdk";

/**
 * Custom login endpoint that ensures Directus tokens are stored in the session.
 *
 * This overrides the directus-nuxt-layer's default login endpoint to guarantee
 * that access_token and refresh_token are stored in session.secure, which is
 * required for the /api/directus/* proxy to work.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { email, password } = body;

  // Validation
  if (!email || !password) {
    throw createError({
      statusCode: 400,
      message: "Email and password are required",
    });
  }

  try {
    const config = useRuntimeConfig();

    // Create Directus client with authentication
    const directus = createDirectus(config.directus.url)
      .with(authentication("json"))
      .with(rest());

    // Authenticate with Directus
    const authResult = await directus.login(email, password);

    if (!authResult.access_token || !authResult.refresh_token) {
      throw createError({
        statusCode: 500,
        message: "Authentication succeeded but tokens were not returned",
      });
    }

    // Get user details
    const user = await directus.request(readMe());

    if (!user) {
      throw createError({
        statusCode: 500,
        message: "Failed to fetch user details",
      });
    }

    // Set user session with Directus tokens for API proxy
    await setUserSession(
      event,
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: typeof user.role === "object" ? user.role.id : user.role,
          provider: "local",
        },
        loggedInAt: Date.now(),
        expiresAt: Date.now() + authResult.expires * 1000, // Convert to milliseconds
      },
      {
        secure: {
          directusAccessToken: authResult.access_token,
          directusRefreshToken: authResult.refresh_token,
        },
      }
    );

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: typeof user.role === "object" ? user.role.id : user.role,
      },
    };
  } catch (error: any) {
    console.error("Login error:", error);

    // Check if it's an authentication error
    if (error.errors) {
      throw createError({
        statusCode: 401,
        message: "Invalid email or password",
      });
    }

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Login failed",
    });
  }
});
