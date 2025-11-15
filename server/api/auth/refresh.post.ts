// server/api/auth/refresh.post.ts
export default defineEventHandler(async (event) => {
  try {
    // Get current session
    const session = await getUserSession(event)

    if (!session?.directusRefreshToken) {
      throw createError({
        statusCode: 401,
        statusMessage: 'No refresh token available'
      })
    }

    // Refresh tokens using Directus SDK
    const newTokens = await refreshUserTokens(session.directusRefreshToken)

    if (!newTokens?.access_token || !newTokens?.refresh_token) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Failed to refresh tokens'
      })
    }

    // Update session with new tokens
    await setUserSession(event, {
      ...session,
      directusAccessToken: newTokens.access_token,
      directusRefreshToken: newTokens.refresh_token,
      expiresAt: Date.now() + (newTokens.expires || 900000) // Default 15 mins
    })

    return {
      success: true,
      expiresAt: Date.now() + (newTokens.expires || 900000)
    }
  } catch (error: any) {
    console.error('Token refresh error:', error)

    throw createError({
      statusCode: error.statusCode || 401,
      statusMessage: error.statusMessage || 'Failed to refresh authentication tokens'
    })
  }
})
