// server/api/auth/login.post.ts
import {
  createDirectus,
  authentication,
  rest,
  readMe,
  readItems,
  staticToken,
} from "@directus/sdk";
import type { SessionUser } from "~/types/directus-schema";

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event);

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: "Email and password are required",
    });
  }

  try {
    // Create a temporary client for authentication
    const authClient = createDirectus(process.env.DIRECTUS_URL!)
      .with(authentication("session", { credentials: "include" }))
      .with(rest());

    // Authenticate with Directus
    const authResult = await authClient.login({ email, password });

    // Create authenticated client with the token
    const client = createDirectus(process.env.DIRECTUS_URL!)
      .with(staticToken(authResult.access_token as string))
      .with(rest());

    // Get user details
    const userData = await client.request(
      readMe({
        fields: [
          "id",
          "email",
          "first_name",
          "last_name",
          "role.id",
          "role.name",
          "role.admin_access",
        ],
      })
    );

    // Check for HOA member association
    const members = await client.request(
      readItems("hoa_members", {
        filter: {
          user: { _eq: userData.id },
        },
        fields: ["id", "organization", "role"],
      })
    );

    const member = members[0];

    // Create session user object
    const sessionUser: SessionUser = {
      id: userData.id as string,
      email: userData.email as string,
      first_name: userData.first_name || null,
      last_name: userData.last_name || null,
      avatar: null,
      role: userData.role || null,
      organization: member?.organization || null,
      member: member || null,
    };

    // Store session with access token (server-side only)
    await setUserSession(event, {
      user: sessionUser,
      directusAccessToken: authResult.access_token,
      directusRefreshToken: authResult.refresh_token,
      expiresAt: Date.now() + (authResult.expires || 900000), // Default 15 mins
    });

    // Return user data (without tokens)
    return {
      user: sessionUser,
    };
  } catch (error: any) {
    console.error("Login error:", error);

    throw createError({
      statusCode: 401,
      statusMessage: error.message || "Invalid email or password",
    });
  }
});
