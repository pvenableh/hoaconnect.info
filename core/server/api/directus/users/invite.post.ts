/**
 * Server API route for user invitations
 * POST: Invite a new user to Directus
 */

import { inviteUser } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { email, role, ...additionalData } = body
    
    if (!email || !role) {
      throw createError({
        statusCode: 400,
        message: 'Email and role are required'
      })
    }
    
    const directus = await getUserDirectus(event)
    
    // Invite user using SDK
    const result = await directus.request(
      inviteUser(email, role, {
        invite_url: `${additionalData.inviteUrl || process.env.APP_URL}/accept-invite`,
        ...additionalData
      })
    )
    
    return {
      success: true,
      message: 'Invitation sent successfully',
      data: result
    }
    
  } catch (error: any) {
    console.error('User invitation error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to send invitation'
    })
  }
})
