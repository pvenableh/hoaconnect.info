/**
 * useDirectusNotifications - Notifications composable
 * 
 * Handles user notifications using native Directus SDK methods
 * All operations require authentication
 * 
 * Usage:
 * const { list, get, create, update, remove, markAsRead } = useDirectusNotifications()
 */

export const useDirectusNotifications = () => {
  const { loggedIn } = useUserSession()
  
  /**
   * List notifications with optional filtering
   */
  const list = async (query?: {
    filter?: Record<string, any>
    fields?: string[]
    sort?: string[]
    limit?: number
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'list',
        query
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch notifications')
    }
    
    return data.value
  }
  
  /**
   * Get unread notifications count
   */
  const unreadCount = async () => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const notifications = await list({
      filter: {
        status: { _eq: 'inbox' }
      },
      fields: ['id']
    })
    
    return notifications?.length || 0
  }
  
  /**
   * Get single notification
   */
  const get = async (notificationId: number, fields?: string[]) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'get',
        id: notificationId,
        query: { fields }
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch notification')
    }
    
    return data.value
  }
  
  /**
   * Create notification
   */
  const create = async (notification: {
    recipient: string
    sender?: string
    subject: string
    message?: string
    collection?: string
    item?: string
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'create',
        data: notification
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to create notification')
    }
    
    return data.value
  }
  
  /**
   * Update notification
   */
  const update = async (notificationId: number, updates: Record<string, any>) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'update',
        id: notificationId,
        data: updates
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to update notification')
    }
    
    return data.value
  }
  
  /**
   * Mark notification as read
   */
  const markAsRead = async (notificationId: number | number[]) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const ids = Array.isArray(notificationId) ? notificationId : [notificationId]
    
    // Update all notifications to archived status
    const promises = ids.map(id => 
      update(id, { status: 'archived' })
    )
    
    await Promise.all(promises)
    return true
  }
  
  /**
   * Delete notification
   */
  const remove = async (notificationId: number | number[]) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { error } = await useFetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'delete',
        id: notificationId
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to delete notification')
    }
    
    return true
  }
  
  return {
    list,
    get,
    create,
    update,
    remove,
    delete: remove, // Alias
    markAsRead,
    unreadCount
  }
}
