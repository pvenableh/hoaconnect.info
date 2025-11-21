import {
  createDirectus,
  rest,
  staticToken,
  login,
  readMe,
} from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event);

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: "Email and password are required",
    });
  }

  try {
    const config = useRuntimeConfig();

    // Create a client for login
    const directus = createDirectus(config.directus.url).with(rest());

    // Authenticate with Directus
    const authResult = await directus.request(login({ email, password }));

    if (!authResult.access_token) {
      throw new Error("Authentication failed");
    }

    // Create an authenticated client to fetch user data
    const authClient = createDirectus(config.directus.url)
      .with(staticToken(authResult.access_token))
      .with(rest());

    // Fetch user data with organization info
    const user = await authClient.request(
      readMe({
        fields: ["*", "role", { organization: ["id", "slug", "name"] }],
      })
    );

    // Set user session with tokens in secure section
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organization: user.organization,
        provider: "local",
      },
      loggedInAt: Date.now(),
      expiresAt: Date.now() + ((authResult.expires || 900) * 1000), // Convert seconds to milliseconds
      secure: {
        directusAccessToken: authResult.access_token,
        directusRefreshToken: authResult.refresh_token,
      },
    });

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organization: user.organization,
      },
    };
  } catch (error: any) {
    console.error("Login error:", error);

    throw createError({
      statusCode: 401,
      statusMessage: error.message || "Invalid email or password",
    });
  }
});
