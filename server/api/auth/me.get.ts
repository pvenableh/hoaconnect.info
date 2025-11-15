// server/api/auth/me.get.ts
export default defineEventHandler(async (event) => {
  try {
    // Get user session
    const session = await getUserSession(event)

    if (!session?.user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Not authenticated'
      })
    }

    // Return user and profile data
    return {
      user: session.user,
      profile: null // Profile data would need to be fetched separately if needed
    }
  } catch (error: any) {
    console.error('Failed to fetch user:', error)

    throw createError({
      statusCode: error.statusCode || 401,
      statusMessage: error.statusMessage || 'Failed to fetch user data'
    })
  }
})
