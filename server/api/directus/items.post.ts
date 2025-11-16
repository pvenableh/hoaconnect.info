/**
 * Server API route for Directus items operations
 * Uses native Directus SDK methods with user authentication
 */

import {
  readItems,
  readItem,
  createItem,
  updateItem,
  deleteItem,
  deleteItems,
  aggregate as directusAggregate
} from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { collection, operation, id, data, query } = body
    
    if (!collection || !operation) {
      throw createError({
        statusCode: 400,
        message: 'Collection and operation are required'
      })
    }
    
    // Get authenticated Directus client with user's token
    const directus = await getUserDirectus(event)
    
    // Handle different operations using native SDK methods
    switch (operation) {
      case 'list':
        return await directus.request(
          readItems(collection, query || {})
        )
      
      case 'get':
        if (!id) throw new Error('ID required for get operation')
        return await directus.request(
          readItem(collection, id, query || {})
        )
      
      case 'create':
        if (!data) throw new Error('Data required for create operation')
        return await directus.request(
          createItem(collection, data, query)
        )
      
      case 'update':
        if (!id) throw new Error('ID required for update operation')
        if (!data) throw new Error('Data required for update operation')
        return await directus.request(
          updateItem(collection, id, data, query)
        )
      
      case 'delete':
        if (!id) throw new Error('ID required for delete operation')
        
        // Handle single or multiple deletions
        if (Array.isArray(id)) {
          await directus.request(deleteItems(collection, id))
          return { deleted: id.length }
        } else {
          await directus.request(deleteItem(collection, id))
          return { deleted: 1 }
        }
      
      case 'aggregate':
        return await directus.request(
          directusAggregate(collection, {
            aggregate: query?.aggregate,
            groupBy: query?.groupBy,
            query: {
              filter: query?.filter
            }
          })
        )
      
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
    
  } catch (error: any) {
    console.error('Directus items API error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to perform operation'
    })
  }
})
