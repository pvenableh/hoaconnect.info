import { readMe } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    // getUserDirectus transparently refreshes an expired/near-expiry access token
    // (and persists the rotated tokens to the session), so this never 401s just
    // because the short-lived Directus access token lapsed.
    const directus = await getUserDirectus(event);

    // Fetch fresh user data (only role ID, not nested role fields due to core
    // collection restrictions)
    const user = await directus.request(readMe({ fields: ["*", "role"] }));

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
    // Preserve the helper's 401 (no usable session); otherwise surface a generic 401.
    if (error?.statusCode) throw error;
    console.error("Fetch user error:", error);
    throw createError({
      statusCode: 401,
      statusMessage: "Failed to fetch user data",
    });
  }
});
