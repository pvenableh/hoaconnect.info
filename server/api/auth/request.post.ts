import { createDirectus, rest } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const { email } = await readBody(event);

  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: "Email is required",
    });
  }

  try {
    const config = useRuntimeConfig();
    
    // Create a Directus client without authentication
    const directus = createDirectus(config.public.directus.url).with(rest());

    // Request password reset using the REST client
    await directus.request({
      method: 'POST',
      path: '/auth/password/request',
      body: JSON.stringify({
        email,
        reset_url: `${config.public.appUrl}/auth/reset-password`
      })
    });

    return {
      success: true,
      message: "If an account exists with this email, a reset link has been sent",
    };
  } catch (error: any) {
    console.error("Password reset request error:", error);

    // Don't reveal if email exists or not for security
    return {
      success: true,
      message: "If an account exists with this email, a reset link has been sent",
    };
  }
});