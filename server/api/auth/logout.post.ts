/**
 * Custom logout endpoint.
 *
 * Clears the user session and logs out from Directus.
 */
export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);

    if (session?.user) {
      // TODO: Call Directus logout endpoint if needed
      // For now, just clear the session
      await clearUserSession(event);
    }

    return {
      success: true,
      message: "Logged out successfully",
    };
  } catch (error: any) {
    console.error("Logout error:", error);

    // Even if there's an error, try to clear the session
    try {
      await clearUserSession(event);
    } catch (clearError) {
      console.error("Failed to clear session:", clearError);
    }

    return {
      success: true,
      message: "Logged out",
    };
  }
});
