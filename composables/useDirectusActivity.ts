/**
 * useDirectusActivity - Activity logs composable
 * 
 * Handles activity log queries using native Directus SDK methods
 * Activity logs are read-only
 * 
 * Usage:
 * const { list, get, getByCollection, getByUser } = useDirectusActivity()
 */

export const useDirectusActivity = () => {
  const { loggedIn } = useUserSession()
  
  /**
   * List activity logs with optional filtering
   */
  const list = async (query?: {
    filter?: Record<string, any>
    fields?: string[]
    sort?: string[]
    limit?: number
    offset?: number
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/activity', {
      method: 'POST',
      body: {
        operation: 'list',
        query
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch activity logs')
    }
    
    return data.value
  }
  
  /**
   * Get single activity log entry
   */
  const get = async (activityId: number, fields?: string[]) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/activity', {
      method: 'POST',
      body: {
        operation: 'get',
        id: activityId,
        query: { fields }
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch activity log')
    }
    
    return data.value
  }
  
  /**
   * Get activity logs for a specific collection
   */
  const getByCollection = async (collection: string, options?: {
    item?: string
    action?: 'create' | 'update' | 'delete' | 'login'
    limit?: number
    sort?: string[]
  }) => {
    const filter: Record<string, any> = {
      collection: { _eq: collection }
    }
    
    if (options?.item) {
      filter.item = { _eq: options.item }
    }
    
    if (options?.action) {
      filter.action = { _eq: options.action }
    }
    
    return await list({
      filter,
      limit: options?.limit || 50,
      sort: options?.sort || ['-timestamp']
    })
  }
  
  /**
   * Get activity logs for a specific user
   */
  const getByUser = async (userId: string, options?: {
    collection?: string
    action?: 'create' | 'update' | 'delete' | 'login'
    limit?: number
  }) => {
    const filter: Record<string, any> = {
      user: { _eq: userId }
    }
    
    if (options?.collection) {
      filter.collection = { _eq: options.collection }
    }
    
    if (options?.action) {
      filter.action = { _eq: options.action }
    }
    
    return await list({
      filter,
      limit: options?.limit || 50,
      sort: ['-timestamp']
    })
  }
  
  /**
   * Get recent activity (last 24 hours)
   */
  const getRecent = async (limit: number = 50) => {
    const oneDayAgo = new Date()
    oneDayAgo.setDate(oneDayAgo.getDate() - 1)
    
    return await list({
      filter: {
        timestamp: { _gte: oneDayAgo.toISOString() }
      },
      limit,
      sort: ['-timestamp']
    })
  }
  
  /**
   * Get activity logs for a specific item
   */
  const getItemHistory = async (collection: string, itemId: string, limit: number = 50) => {
    return await getByCollection(collection, {
      item: itemId,
      limit,
      sort: ['-timestamp']
    })
  }
  
  return {
    list,
    get,
    getByCollection,
    getByUser,
    getRecent,
    getItemHistory
  }
}
