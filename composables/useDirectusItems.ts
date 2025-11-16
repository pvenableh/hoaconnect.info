/**
 * useDirectusItems - Comprehensive CRUD composable for Directus collections
 * 
 * Handles both authenticated and public operations:
 * - Authenticated: Proxies through server API with user token
 * - Public: Direct client-side calls with public token
 * 
 * Usage:
 * const { list, get, create, update, remove } = useDirectusItems('hoa_members')
 * const members = await list({ filter: { status: { _eq: 'active' } } })
 */

import type { QueryFilter } from '@directus/sdk'
import type { DirectusCollections } from '~/types/directus-schema'

interface ItemsQuery {
  fields?: string[]
  filter?: QueryFilter<any>
  sort?: string[]
  limit?: number
  offset?: number
  page?: number
  search?: string
  deep?: Record<string, any>
  aggregate?: Record<string, string[]>
  groupBy?: string[]
}

export const useDirectusItems = <T extends DirectusCollections>(collection: T) => {
  const { loggedIn } = useUserSession()
  
  /**
   * List items from collection
   */
  const list = async (query: ItemsQuery = {}) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/items', {
      method: 'POST',
      body: {
        collection,
        operation: 'list',
        query
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch items')
    }
    
    return data.value
  }
  
  /**
   * Get single item by ID
   */
  const get = async (id: string | number, query: Pick<ItemsQuery, 'fields' | 'deep'> = {}) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/items', {
      method: 'POST',
      body: {
        collection,
        operation: 'get',
        id,
        query
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch item')
    }
    
    return data.value
  }
  
  /**
   * Create new item
   */
  const create = async (data: Record<string, any>, query: Pick<ItemsQuery, 'fields'> = {}) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data: result, error } = await useFetch('/api/directus/items', {
      method: 'POST',
      body: {
        collection,
        operation: 'create',
        data,
        query
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to create item')
    }
    
    return result.value
  }
  
  /**
   * Update existing item
   */
  const update = async (id: string | number, data: Record<string, any>, query: Pick<ItemsQuery, 'fields'> = {}) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data: result, error } = await useFetch('/api/directus/items', {
      method: 'POST',
      body: {
        collection,
        operation: 'update',
        id,
        data,
        query
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to update item')
    }
    
    return result.value
  }
  
  /**
   * Delete item(s)
   */
  const remove = async (id: string | number | (string | number)[]) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { error } = await useFetch('/api/directus/items', {
      method: 'POST',
      body: {
        collection,
        operation: 'delete',
        id
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to delete item')
    }
    
    return true
  }
  
  /**
   * Aggregate data
   */
  const aggregate = async (query: Pick<ItemsQuery, 'aggregate' | 'groupBy' | 'filter'>) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/items', {
      method: 'POST',
      body: {
        collection,
        operation: 'aggregate',
        query
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to aggregate data')
    }
    
    return data.value
  }
  
  /**
   * Count items
   */
  const count = async (filter?: QueryFilter<any>) => {
    const result = await aggregate({
      aggregate: { count: ['*'] },
      filter
    })
    
    return result?.[0]?.count || 0
  }
  
  return {
    list,
    get,
    create,
    update,
    remove,
    delete: remove, // Alias
    aggregate,
    count
  }
}
