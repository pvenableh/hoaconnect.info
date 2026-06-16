/**
 * Server API route for resetting password
 * POST: Reset password with token
 */

import { passwordReset, createDirectus, rest } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { token, password } = body;

    if (!token || !password) {
      throw createError({
        statusCode: 400,
        message: "Token and password are required",
      });
    }

    const config = useRuntimeConfig();

    // Create a public client (no authentication needed)
    const directus = createDirectus(config.directus.url).with(rest());

    // Reset password using SDK
    await directus.request(passwordReset(token, password));

    return {
      success: true,
      message: "Password reset successfully",
    };
  } catch (error: any) {
    console.error("Password reset error:", error);

    throw createError({
      statusCode: error.statusCode || 400,
      message: error.message || "Failed to reset password",
    });
  }
});
