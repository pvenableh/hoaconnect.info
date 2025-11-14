/**
 * Typed Directus Utilities
 *
 * This utility provides type-safe access to Directus operations
 * using the schema definitions from types/directus-schema.ts
 */

import { createDirectus, rest, staticToken, type RestClient } from '@directus/sdk'
import type { DirectusSchema } from '~/types/directus-schema'

/**
 * Get typed admin Directus client
 * Uses the layer's configuration but adds type safety
 */
export const getTypedDirectus = () => {
  const config = useRuntimeConfig()

  const directusUrl = config.directus.url
  const adminToken = config.directus.staticToken

  if (!directusUrl) {
    throw new Error('DIRECTUS_URL is not configured')
  }

  if (!adminToken) {
    throw new Error('DIRECTUS_STATIC_TOKEN is not configured')
  }

  // Create typed Directus client
  const client = createDirectus<DirectusSchema>(directusUrl)
    .with(staticToken(adminToken))
    .with(rest())

  return client
}

/**
 * Type-safe update for any Directus collection
 * Provides better typing than the direct $fetch approach
 */
export const updateTypedDirectusItem = async <
  TCollection extends keyof DirectusSchema
>(
  collection: TCollection,
  id: string | number,
  data: Partial<DirectusSchema[TCollection][number]>
) => {
  const config = useRuntimeConfig()

  const directusUrl = config.directus.url
  const adminToken = config.directus.staticToken

  const response = await $fetch(
    `${directusUrl}/items/${collection as string}/${id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: data,
    }
  )

  return response as DirectusSchema[TCollection][number]
}
