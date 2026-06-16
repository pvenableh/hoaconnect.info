/**
 * Server API route for notifications operations
 * Uses native Directus SDK methods
 */

import {
  readNotifications,
  readNotification,
  createNotification,
  updateNotification,
  deleteNotification,
  deleteNotifications
} from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { operation, id, data, query } = body
    
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
          readNotifications(query || {})
        )
      
      case 'get':
        if (!id) throw new Error('Notification ID required for get operation')
        return await directus.request(
          readNotification(id, query || {})
        )
      
      case 'create':
        if (!data) throw new Error('Data required for create operation')
        return await directus.request(
          createNotification(data)
        )
      
      case 'update':
        if (!id) throw new Error('Notification ID required for update operation')
        if (!data) throw new Error('Data required for update operation')
        return await directus.request(
          updateNotification(id, data)
        )
      
      case 'delete':
        if (!id) throw new Error('Notification ID required for delete operation')
        
        if (Array.isArray(id)) {
          await directus.request(deleteNotifications(id))
          return { deleted: id.length }
        } else {
          await directus.request(deleteNotification(id))
          return { deleted: 1 }
        }
      
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
    
  } catch (error: any) {
    console.error('Directus notifications API error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to perform notification operation'
    })
  }
})
