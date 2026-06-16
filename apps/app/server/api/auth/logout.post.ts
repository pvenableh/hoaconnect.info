export default defineEventHandler(async (event) => {
  try {
    // Clear the session
    await clearUserSession(event);

    return {
      success: true,
      message: "Successfully logged out",
    };
  } catch (error: any) {
    console.error("Logout error:", error);

    // Even if logout fails, clear the session
    await clearUserSession(event);

    return {
      success: true,
      message: "Session cleared",
    };
  }
});