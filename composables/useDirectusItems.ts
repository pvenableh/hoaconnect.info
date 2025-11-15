import type { DirectusCollections, DirectusSchema, DirectusItem } from '~/types/directus-schema'
import type { ID } from '@directus/sdk'

interface ItemsOptions {
  fields?: string[]
  filter?: any
  sort?: string[]
  limit?: number
  offset?: number
  page?: number
  search?: string
  deep?: any
}

export const useDirectusItems = () => {
  const { member } = useDirectusAuth()
  
  /**
   * Add organization filter for multi-tenancy
   */
  const addOrgFilter = (filter: any = {}) => {
    // Skip org filter for system collections
    const systemCollections = ['directus_users', 'directus_roles', 'directus_files']
    
    if (!member.value?.organization) {
      return filter
    }
    
    return {
      ...filter,
      organization: {
        _eq: member.value.organization
      }
    }
  }

  /**
   * Fetch multiple items from a collection
   */
  const fetchItems = async <T extends DirectusCollections>(
    collection: T,
    options: ItemsOptions = {}
  ): Promise<DirectusItem<T>[]> => {
    try {
      // Apply multi-tenancy filter for HOA collections
      const filter = collection.startsWith('hoa_') 
        ? addOrgFilter(options.filter)
        : options.filter

      const response = await $fetch(`/api/directus/items/${collection}`, {
        method: 'GET',
        query: {
          ...options,
          filter: filter ? JSON.stringify(filter) : undefined,
          fields: options.fields ? options.fields.join(',') : undefined,
          sort: options.sort ? options.sort.join(',') : undefined
        }
      })
      
      return response as DirectusItem<T>[]
    } catch (error: any) {
      console.error(`Failed to fetch ${collection}:`, error)
      throw error
    }
  }

  /**
   * Fetch a single item from a collection
   */
  const fetchItem = async <T extends DirectusCollections>(
    collection: T,
    id: ID,
    options: { fields?: string[] } = {}
  ): Promise<DirectusItem<T>> => {
    try {
      const response = await $fetch(`/api/directus/items/${collection}/${id}`, {
        method: 'GET',
        query: {
          fields: options.fields ? options.fields.join(',') : undefined
        }
      })
      
      return response as DirectusItem<T>
    } catch (error: any) {
      console.error(`Failed to fetch ${collection}/${id}:`, error)
      throw error
    }
  }

  /**
   * Create a new item in a collection
   */
  const createItem = async <T extends DirectusCollections>(
    collection: T,
    data: Partial<DirectusItem<T>>
  ): Promise<DirectusItem<T>> => {
    try {
      // Add organization for HOA collections
      if (collection.startsWith('hoa_') && member.value?.organization) {
        data = {
          ...data,
          organization: member.value.organization as any
        }
      }
      
      const response = await $fetch(`/api/directus/items/${collection}`, {
        method: 'POST',
        body: data
      })
      
      return response as DirectusItem<T>
    } catch (error: any) {
      console.error(`Failed to create ${collection}:`, error)
      throw error
    }
  }

  /**
   * Update an existing item
   */
  const updateItem = async <T extends DirectusCollections>(
    collection: T,
    id: ID,
    data: Partial<DirectusItem<T>>
  ): Promise<DirectusItem<T>> => {
    try {
      const response = await $fetch(`/api/directus/items/${collection}/${id}`, {
        method: 'PATCH',
        body: data
      })
      
      return response as DirectusItem<T>
    } catch (error: any) {
      console.error(`Failed to update ${collection}/${id}:`, error)
      throw error
    }
  }

  /**
   * Delete an item
   */
  const deleteItem = async <T extends DirectusCollections>(
    collection: T,
    id: ID
  ): Promise<void> => {
    try {
      await $fetch(`/api/directus/items/${collection}/${id}`, {
        method: 'DELETE'
      })
    } catch (error: any) {
      console.error(`Failed to delete ${collection}/${id}:`, error)
      throw error
    }
  }

  /**
   * Delete multiple items
   */
  const deleteItems = async <T extends DirectusCollections>(
    collection: T,
    ids: ID[]
  ): Promise<void> => {
    try {
      await $fetch(`/api/directus/items/${collection}`, {
        method: 'DELETE',
        body: { keys: ids }
      })
    } catch (error: any) {
      console.error(`Failed to delete multiple ${collection}:`, error)
      throw error
    }
  }

  /**
   * Aggregate data from a collection
   */
  const aggregate = async <T extends DirectusCollections>(
    collection: T,
    options: {
      aggregate?: Record<string, string[]>
      groupBy?: string[]
      filter?: any
    } = {}
  ): Promise<any> => {
    try {
      const filter = collection.startsWith('hoa_') 
        ? addOrgFilter(options.filter)
        : options.filter

      const response = await $fetch(`/api/directus/aggregate/${collection}`, {
        method: 'GET',
        query: {
          aggregate: options.aggregate ? JSON.stringify(options.aggregate) : undefined,
          groupBy: options.groupBy ? options.groupBy.join(',') : undefined,
          filter: filter ? JSON.stringify(filter) : undefined
        }
      })
      
      return response
    } catch (error: any) {
      console.error(`Failed to aggregate ${collection}:`, error)
      throw error
    }
  }

  return {
    fetchItems,
    fetchItem,
    createItem,
    updateItem,
    deleteItem,
    deleteItems,
    aggregate,
    
    // Aliases for convenience
    list: fetchItems,
    get: fetchItem,
    create: createItem,
    update: updateItem,
    remove: deleteItem,
    removeMany: deleteItems
  }
}
