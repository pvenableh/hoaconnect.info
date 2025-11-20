/**
 * Server API route for accepting user invitations
 * POST: Accept invitation and set password
 */

import { acceptUserInvite } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { token, password } = body
    
    if (!token || !password) {
      throw createError({
        statusCode: 400,
        message: 'Token and password are required'
      })
    }
    
    const config = useRuntimeConfig()

    // Create a public client (no authentication needed for accepting invite)
    const directus = createDirectus(config.directus.url)
      .with(rest())
    
    // Accept invitation using SDK
    await directus.request(
      acceptUserInvite(token, password)
    )
    
    return {
      success: true,
      message: 'Invitation accepted successfully'
    }
    
  } catch (error: any) {
    console.error('Accept invitation error:', error)
    
    throw createError({
      statusCode: error.statusCode || 400,
      message: error.message || 'Failed to accept invitation'
    })
  }
})
