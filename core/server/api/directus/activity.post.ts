/**
 * Server API route for activity log operations
 * Uses native Directus SDK methods (read-only)
 */

import { readActivities, readActivity } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { operation, id, query } = body
    
    if (!operation) {
      throw createError({
        statusCode: 400,
        message: 'Operation is required'
      })
    }
    
    const directus = await getUserDirectus(event)
    
    switch (operation) {
      case 'list':
        return await directus.request(
          readActivities(query || {})
        )
      
      case 'get':
        if (!id) throw new Error('Activity ID required for get operation')
        return await directus.request(
          readActivity(id, query || {})
        )
      
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
    
  } catch (error: any) {
    console.error('Directus activity API error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to perform activity operation'
    })
  }
})
