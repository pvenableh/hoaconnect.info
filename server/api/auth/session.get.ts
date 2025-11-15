// server/api/auth/session.get.ts
export default defineEventHandler(async (event) => {
  try {
    // Get user session
    const session = await getUserSession(event)
    
    if (!session?.user) {
      return {
        user: null,
        loggedIn: false
      }
    }
    
    // Return session info without tokens for security
    return {
      user: session.user,
      loggedIn: true
    }
  } catch (error) {
    console.error('Session error:', error)
    
    return {
      user: null,
      loggedIn: false
    }
  }
})
