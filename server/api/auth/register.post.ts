import {
  createDirectus,
  rest,
  createUser,
  authentication,
  login,
  readMe,
} from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { email, password, first_name, last_name, phone } = body;

  if (!email || !password || !first_name || !last_name) {
    throw createError({
      statusCode: 400,
      statusMessage: "Email, password, first name, and last name are required",
    });
  }

  try {
    const config = useRuntimeConfig();
    const adminClient = getTypedDirectus();

    // Find the default member role
    // You can either:
    // 1. Hardcode your default role UUID here
    // 2. Or query Directus for the role by name
    const DEFAULT_MEMBER_ROLE_ID = "38494e81-9b49-4c64-a197-fcb8097cd433"; // TODO: Update this!

    // Create the user
    const newUser = await adminClient.request(
      createUser({
        email,
        password,
        first_name,
        last_name,
        phone: phone || null,
        role: DEFAULT_MEMBER_ROLE_ID,
        status: "active",
      })
    );

    // Auto-login after registration
    const authClient = createDirectus(config.directus.url).with(rest());
    const authResult = await authClient.request(login({ email, password }));

    if (!authResult.access_token) {
      throw new Error("Auto-login failed after registration");
    }

    // Create authenticated client to fetch user data
    const userClient = createDirectus(config.directus.url)
      .with(rest())
      .with(authentication("json"));

    await userClient.setToken(authResult.access_token);

    const userData = await userClient.request(
      readMe({
        fields: ["*", "role"],
      })
    );

    // Set user session
    await setUserSession(event, {
      user: {
        id: userData.id,
        email: userData.email,
        firstName: userData.first_name,
        lastName: userData.last_name,
        role: userData.role,
        provider: "local",
      },
      loggedInAt: Date.now(),
      expiresAt: Date.now() + (authResult.expires || 900) * 1000, // Convert seconds to milliseconds
      secure: {
        directusAccessToken: authResult.access_token,
        directusRefreshToken: authResult.refresh_token,
      },
    });

    return {
      success: true,
      user: {
        id: userData.id,
        email: userData.email,
        firstName: userData.first_name,
        lastName: userData.last_name,
        role: userData.role,
      },
    };
  } catch (error: any) {
    console.error("Registration error:", error);

    if (
      error.message?.includes("unique") ||
      error.message?.includes("duplicate")
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "An account with this email already exists",
      });
    }

    throw createError({
      statusCode: 400,
      statusMessage: error.message || "Registration failed",
    });
  }
});
