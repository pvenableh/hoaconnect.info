// server/api/auth/logout.post.ts
import { createDirectus, authentication, rest } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    // Get current session
    const session = await getUserSession(event)

    if (session?.directusRefreshToken) {
      // Revoke refresh token in Directus
      const config = useRuntimeConfig()
      const directus = createDirectus(config.public.directusUrl)
        .with(authentication('json'))
        .with(rest())

      try {
        await directus.logout(session.directusRefreshToken)
      } catch (error) {
        // Log but don't fail if token revocation fails
        console.error('Failed to revoke refresh token:', error)
      }
    }
    
    // Clear the session
    await clearUserSession(event)
    
    return { success: true }
  } catch (error) {
    console.error('Logout error:', error)
    
    // Still clear session even if something goes wrong
    await clearUserSession(event)
    
    return { success: true }
  }
})
