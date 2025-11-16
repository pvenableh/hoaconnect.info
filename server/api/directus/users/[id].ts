/**
 * Server API route for individual user operations
 * GET: Read user by ID
 * PATCH: Update user by ID
 * DELETE: Delete user by ID
 * (Admin only operations)
 */

import { readUser, updateUser, deleteUser } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const method = event.method
    const userId = getRouterParam(event, 'id')
    
    if (!userId) {
      throw createError({
        statusCode: 400,
        message: 'User ID is required'
      })
    }
    
    const directus = await getUserDirectus(event)
    
    if (method === 'GET') {
      // Get query parameters for fields
      const query = getQuery(event)
      const fields = query.fields ? 
        (query.fields as string).split(',') : 
        ['*', 'role.*']
      
      const user = await directus.request(
        readUser(userId, { fields })
      )
      
      return user
    }
    
    if (method === 'PATCH') {
      const updates = await readBody(event)
      
      const user = await directus.request(
        updateUser(userId, updates)
      )
      
      return user
    }
    
    if (method === 'DELETE') {
      await directus.request(
        deleteUser(userId)
      )
      
      return {
        success: true,
        message: 'User deleted successfully'
      }
    }
    
    throw createError({
      statusCode: 405,
      message: `Method ${method} not allowed`
    })
    
  } catch (error: any) {
    console.error('User operation error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to perform user operation'
    })
  }
})
