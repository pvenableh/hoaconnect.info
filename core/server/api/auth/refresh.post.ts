// server/api/auth/refresh.post.ts
// Refresh routes through dedupedDirectusRefresh (auto-imported from
// server/utils/directus.ts) so concurrent refreshes don't race the single-use
// token; failures are classified 401 (dead) vs 503 (transient) and never clear.

export default defineEventHandler(async (event) => {
  console.log('[refresh] Token refresh request received');

  try {
    const session = await getUserSession(event);
    const refreshToken = getSessionRefreshToken(session);

    console.log('[refresh] Session exists:', !!session);
    console.log('[refresh] Refresh token exists:', !!refreshToken);

    if (!session || !refreshToken) {
      console.error('[refresh] No session or refresh token available');
      throw createError({
        statusCode: 401,
        statusMessage: "No refresh token available",
      });
    }

    // Check current token expiration
    const currentExpiresAt = session.expiresAt;
    const now = Date.now();
    const minutesUntilExpiry = currentExpiresAt ? Math.floor((currentExpiresAt - now) / 60000) : 0;

    console.log('[refresh] Current token expires in:', minutesUntilExpiry, 'minutes');

    // Refresh through the rotation-dedup so a timer/tab-focus refresh racing an
    // in-flight one reuses the winner instead of 401ing on the rotated token.
    console.log('[refresh] Calling Directus refresh (deduped)...');
    const authResult: any = await dedupedDirectusRefresh(refreshToken);

    if (!authResult.access_token) {
      throw new Error("Token refresh failed - no access token returned");
    }

    // Calculate new expiration time
    const expiresInSeconds = authResult.expires || 900;
    const newExpiresAt = Date.now() + (expiresInSeconds * 1000);
    const newMinutesUntilExpiry = Math.floor(expiresInSeconds / 60);

    console.log('[refresh] New token expires in:', newMinutesUntilExpiry, 'minutes');

    // Update session with new tokens
    await setUserSession(event, {
      ...session,
      expiresAt: newExpiresAt,
      secure: {
        directusAccessToken: authResult.access_token,
        directusRefreshToken: authResult.refresh_token || refreshToken,
      },
    });

    console.log('[refresh] Token refreshed successfully');

    return {
      success: true,
      message: "Token refreshed successfully",
      expiresIn: expiresInSeconds,
    };
  } catch (error: any) {
    console.error("[refresh] Token refresh error:", error?.message || error);

    // Never clear the session here — the client owns teardown. Distinguish a DEAD
    // refresh token (Directus 401/403 / invalid-credentials — a real logout) from
    // a TRANSIENT failure (network / 5xx / our 8s timeout — keep the session and
    // let the client retry). Ambiguous errors default to 503 so a hiccup never
    // logs the user out. (Earnest §3.)
    const code = error?.errors?.[0]?.extensions?.code;
    const status = error?.response?.status ?? error?.status;
    const dead =
      status === 401 ||
      status === 403 ||
      code === "INVALID_CREDENTIALS" ||
      code === "TOKEN_EXPIRED" ||
      code === "INVALID_TOKEN";
    throw createError({
      statusCode: dead ? 401 : 503,
      statusMessage: dead ? "Session expired" : "Refresh temporarily unavailable",
    });
  }
});
