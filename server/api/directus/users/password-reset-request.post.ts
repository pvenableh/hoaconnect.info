/**
 * Server API route for requesting password reset
 * POST: Send password reset email
 */

import { passwordRequest } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { email } = body
    
    if (!email) {
      throw createError({
        statusCode: 400,
        message: 'Email is required'
      })
    }
    
    const config = useRuntimeConfig()
    
    // Create a public client (no authentication needed)
    const directus = createDirectus(config.public.directus.url)
      .with(rest())
    
    // Request password reset using SDK
    await directus.request(
      passwordRequest(email, `${process.env.APP_URL}/reset-password`)
    )
    
    return {
      success: true,
      message: 'Password reset email sent'
    }
    
  } catch (error: any) {
    console.error('Password reset request error:', error)
    
    // Don't reveal if email exists for security
    return {
      success: true,
      message: 'If the email exists, a reset link has been sent'
    }
  }
})
