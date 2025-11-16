/**
 * Server API route for user management
 * POST: List users with filtering (admin only)
 */

import { readUsers } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { query } = body
    
    const directus = await getUserDirectus(event)
    
    // List users using SDK
    const users = await directus.request(
      readUsers(query || {})
    )
    
    return users
    
  } catch (error: any) {
    console.error('List users error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to fetch users'
    })
  }
})
