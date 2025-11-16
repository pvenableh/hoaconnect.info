import { createDirectus, rest } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const { token, password } = await readBody(event);

  if (!token || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: "Token and password are required",
    });
  }

  try {
    const config = useRuntimeConfig();
    
    // Create a Directus client without authentication
    const directus = createDirectus(config.public.directus.url).with(rest());

    // Reset the password using the REST client
    await directus.request({
      method: 'POST',
      path: '/auth/password/reset',
      body: JSON.stringify({
        token,
        password
      })
    });

    return {
      success: true,
      message: "Password reset successfully",
    };
  } catch (error: any) {
    console.error("Password reset error:", error);

    throw createError({
      statusCode: 400,
      statusMessage: error.message || "Invalid or expired reset token",
    });
  }
});