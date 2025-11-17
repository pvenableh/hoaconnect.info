import {
  createDirectus,
  rest,
  authentication,
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

    // Create a temporary client for login
    const directus = createDirectus(config.public.directus.url).with(rest());

    // Authenticate with Directus
    const authResult = await directus.request(login({ email, password }));

    if (!authResult.access_token) {
      throw new Error("Authentication failed");
    }

    // Create an authenticated client to fetch user data
    const authClient = createDirectus(config.public.directus.url)
      .with(rest())
      .with(authentication("json"));

    // Set the token
    await authClient.setToken(authResult.access_token);

    // Fetch user data with role information
    const user = await authClient.request(
      readMe({
        fields: ["*", "role.id", "role.name", "role.admin_access"],
      })
    );

    // Set user session
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        provider: "local",
      },
      directusAccessToken: authResult.access_token,
      directusRefreshToken: authResult.refresh_token,
      loggedInAt: Date.now(),
      expiresAt: Date.now() + (authResult.expires || 900000), // Default 15 min
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
