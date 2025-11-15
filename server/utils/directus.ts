import {
  createDirectus,
  rest,
  authentication,
  staticToken,
  type RestClient,
  type StaticTokenClient,
  type AuthenticationClient,
  readItems,
  readItem,
  createItem,
  updateItem,
  deleteItem,
  type ID,
} from '@directus/sdk'
import type { DirectusSchema, DirectusCollections } from '~/types/directus-schema'

/**
 * Get a typed Directus client with admin access
 * Uses static token for server-side operations
 */
export function getTypedDirectus() {
  const config = useRuntimeConfig()
  
  const client = createDirectus<DirectusSchema>(config.directus.url)
    .with(staticToken(config.directus.staticToken))
    .with(rest())

  return client
}

/**
 * Get a Directus client with user authentication
 * Uses the session token from nuxt-auth-utils
 */
export async function getUserDirectus(event: any) {
  const config = useRuntimeConfig()
  const session = await getUserSession(event)
  
  if (!session?.directusAccessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'No authentication token available'
    })
  }

  const client = createDirectus<DirectusSchema>(config.directus.url)
    .with(staticToken(session.directusAccessToken))
    .with(rest())

  return client
}

/**
 * Type-safe wrapper for updating Directus items
 * Handles complex objects without TypeScript errors
 */
export async function updateTypedDirectusItem<T extends DirectusCollections>(
  collection: T,
  id: ID,
  data: Partial<DirectusSchema[T]>
) {
  const directus = getTypedDirectus()
  
  return await directus.request(
    updateItem(collection, id, data as any)
  )
}

/**
 * Type-safe wrapper for creating Directus items
 */
export async function createTypedDirectusItem<T extends DirectusCollections>(
  collection: T,
  data: Partial<DirectusSchema[T]>
) {
  const directus = getTypedDirectus()
  
  return await directus.request(
    createItem(collection, data as any)
  )
}

/**
 * Type-safe wrapper for reading multiple items
 */
export async function readTypedDirectusItems<T extends DirectusCollections>(
  collection: T,
  query?: any
) {
  const directus = getTypedDirectus()
  
  return await directus.request(
    readItems(collection, query)
  ) as DirectusSchema[T][]
}

/**
 * Type-safe wrapper for reading a single item
 */
export async function readTypedDirectusItem<T extends DirectusCollections>(
  collection: T,
  id: ID,
  query?: any
) {
  const directus = getTypedDirectus()
  
  return await directus.request(
    readItem(collection, id, query)
  ) as DirectusSchema[T]
}

/**
 * Type-safe wrapper for deleting items
 */
export async function deleteTypedDirectusItem<T extends DirectusCollections>(
  collection: T,
  id: ID
) {
  const directus = getTypedDirectus()
  
  return await directus.request(
    deleteItem(collection, id)
  )
}

/**
 * Helper to refresh user authentication tokens
 */
export async function refreshUserTokens(refreshToken: string) {
  const config = useRuntimeConfig()
  
  const client = createDirectus<DirectusSchema>(config.directus.url)
    .with(authentication('session'))
    .with(rest())
  
  try {
    const result = await client.refresh('session', refreshToken)
    return result
  } catch (error) {
    console.error('Failed to refresh tokens:', error)
    throw error
  }
}
