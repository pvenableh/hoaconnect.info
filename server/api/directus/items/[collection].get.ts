import { readItems } from '@directus/sdk'
import { getUserDirectus } from '~/server/utils/directus'

export default defineEventHandler(async (event) => {
  const collection = getRouterParam(event, 'collection')
  const query = getQuery(event)
  
  if (!collection) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection name is required'
    })
  }
  
  try {
    const directus = await getUserDirectus(event)
    
    // Build query options
    const options: any = {}
    
    if (query.fields) {
      options.fields = typeof query.fields === 'string' 
        ? query.fields.split(',')
        : query.fields
    }
    
    if (query.filter) {
      options.filter = typeof query.filter === 'string'
        ? JSON.parse(query.filter)
        : query.filter
    }
    
    if (query.sort) {
      options.sort = typeof query.sort === 'string'
        ? query.sort.split(',')
        : query.sort
    }
    
    if (query.limit) {
      options.limit = parseInt(query.limit as string)
    }
    
    if (query.offset) {
      options.offset = parseInt(query.offset as string)
    }
    
    if (query.page) {
      options.page = parseInt(query.page as string)
    }
    
    if (query.search) {
      options.search = query.search
    }
    
    const items = await directus.request(
      readItems(collection as any, options)
    )
    
    return items
    
  } catch (error: any) {
    console.error(`Failed to fetch ${collection}:`, error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || `Failed to fetch ${collection}`
    })
  }
})
