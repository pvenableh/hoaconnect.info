import { createItem } from '@directus/sdk'
import { getUserDirectus } from '~/server/utils/directus'

export default defineEventHandler(async (event) => {
  const collection = getRouterParam(event, 'collection')
  const body = await readBody(event)
  
  if (!collection) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection name is required'
    })
  }
  
  try {
    const directus = await getUserDirectus(event)
    
    const item = await directus.request(
      createItem(collection as any, body)
    )
    
    return item
    
  } catch (error: any) {
    console.error(`Failed to create ${collection}:`, error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || `Failed to create ${collection}`
    })
  }
})
