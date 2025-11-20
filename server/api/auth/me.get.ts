import { createDirectus, rest, authentication, readMe } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);
    const accessToken = getSessionAccessToken(session);

    if (!session || !accessToken) {
      throw createError({
        statusCode: 401,
        statusMessage: "Not authenticated",
      });
    }

    const config = useRuntimeConfig();

    // Create authenticated client
    const directus = createDirectus(config.directus.url)
      .with(rest())
      .with(authentication("json"));

    // Set the token
    await directus.setToken(accessToken);

    // Fetch fresh user data (only role ID, not nested role fields due to core collection restrictions)
    const user = await directus.request(
      readMe({
        fields: ["*", "role"],
      })
    );

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
    console.error("Fetch user error:", error);

    throw createError({
      statusCode: 401,
      statusMessage: "Failed to fetch user data",
    });
  }
});
