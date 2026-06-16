/**
 * useDirectusNotifications - Notifications composable
 *
 * Handles user notifications using native Directus SDK methods
 * All operations require authentication
 *
 * Usage:
 * const { list, get, create, update, remove, markAsRead, sendTo, broadcast, useNotificationList } = useDirectusNotifications()
 */

interface DirectusNotification {
  id: string
  timestamp: string
  status: 'inbox' | 'archived'
  recipient: string
  sender: string | null
  subject: string
  message: string | null
  collection: string | null
  item: string | null
}

interface NotificationQuery {
  filter?: Record<string, any>
  fields?: string[]
  sort?: string[]
  limit?: number
}

export const useDirectusNotifications = () => {
  const { loggedIn } = useUserSession()

  /**
   * List notifications with optional filtering
   */
  const list = async (query?: NotificationQuery): Promise<DirectusNotification[]> => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    return await $fetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'list',
        query: {
          sort: ['-timestamp'],
          ...query
        }
      }
    })
  }

  /**
   * Get unread notifications
   */
  const getUnread = async (): Promise<DirectusNotification[]> => {
    return await list({
      filter: { status: { _eq: 'inbox' } },
      sort: ['-timestamp']
    })
  }

  /**
   * Get archived notifications
   */
  const getArchived = async (): Promise<DirectusNotification[]> => {
    return await list({
      filter: { status: { _eq: 'archived' } },
      sort: ['-timestamp']
    })
  }

  /**
   * Get unread notifications count
   */
  const countUnread = async (): Promise<number> => {
    const notifications = await list({
      filter: { status: { _eq: 'inbox' } },
      fields: ['id']
    })
    return notifications?.length || 0
  }

  /**
   * Get single notification
   */
  const get = async (notificationId: string | number, fields?: string[]): Promise<DirectusNotification> => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    return await $fetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'get',
        id: notificationId,
        query: { fields }
      }
    })
  }

  /**
   * Create notification
   */
  const create = async (notification: Partial<DirectusNotification>): Promise<DirectusNotification> => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    return await $fetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'create',
        data: notification
      }
    })
  }

  /**
   * Create multiple notifications
   */
  const createMany = async (notifications: Partial<DirectusNotification>[]): Promise<DirectusNotification[]> => {
    return await Promise.all(notifications.map(n => create(n)))
  }

  /**
   * Send notification to a specific user
   */
  const sendTo = async (
    userId: string,
    subject: string,
    message?: string,
    options?: { collection?: string; item?: string }
  ): Promise<DirectusNotification> => {
    return await create({
      recipient: userId,
      subject,
      message,
      collection: options?.collection,
      item: options?.item
    })
  }

  /**
   * Broadcast notification to multiple users
   */
  const broadcast = async (
    userIds: string[],
    subject: string,
    message?: string
  ): Promise<DirectusNotification[]> => {
    return await createMany(
      userIds.map(userId => ({ recipient: userId, subject, message }))
    )
  }

  /**
   * Update notification
   */
  const update = async (
    notificationId: string | number,
    updates: Partial<DirectusNotification>
  ): Promise<DirectusNotification> => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    return await $fetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'update',
        id: notificationId,
        data: updates
      }
    })
  }

  /**
   * Archive a notification (mark as read)
   */
  const archive = async (id: string | number): Promise<DirectusNotification> => {
    return await update(id, { status: 'archived' })
  }

  /**
   * Archive multiple notifications
   */
  const archiveMany = async (ids: (string | number)[]): Promise<DirectusNotification[]> => {
    return await Promise.all(ids.map(id => archive(id)))
  }

  /**
   * Archive all unread notifications
   */
  const archiveAll = async (): Promise<DirectusNotification[]> => {
    const unread = await getUnread()
    return await archiveMany(unread.map(n => n.id))
  }

  /**
   * Mark notification as read (alias for archive)
   */
  const markAsRead = async (notificationId: string | number | (string | number)[]): Promise<boolean> => {
    const ids = Array.isArray(notificationId) ? notificationId : [notificationId]
    await archiveMany(ids)
    return true
  }

  /**
   * Mark notification as unread
   */
  const markAsUnread = async (id: string | number): Promise<DirectusNotification> => {
    return await update(id, { status: 'inbox' })
  }

  /**
   * Delete notification
   */
  const remove = async (notificationId: string | number | (string | number)[]): Promise<boolean> => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    await $fetch('/api/directus/notifications', {
      method: 'POST',
      body: {
        operation: 'delete',
        id: notificationId
      }
    })

    return true
  }

  /**
   * Delete multiple notifications
   */
  const removeMany = async (ids: (string | number)[]): Promise<boolean> => {
    return await remove(ids)
  }

  /**
   * Clear all archived notifications
   */
  const clearArchived = async (): Promise<boolean> => {
    const archived = await getArchived()
    if (archived.length > 0) {
      await removeMany(archived.map(n => n.id))
    }
    return true
  }

  /**
   * Reactive notification list hook
   * Provides auto-refreshing notification list with unread count
   */
  const useNotificationList = (options?: { autoRefresh?: number }) => {
    const notifications = ref<DirectusNotification[]>([])
    const unreadCount = ref(0)
    const loading = ref(false)
    const error = ref<string | null>(null)

    const refresh = async () => {
      if (!loggedIn.value) return

      loading.value = true
      error.value = null

      try {
        const [allNotifications, count] = await Promise.all([
          list(),
          countUnread()
        ])
        notifications.value = allNotifications
        unreadCount.value = count
      } catch (e: any) {
        error.value = e.message || 'Failed to fetch notifications'
      } finally {
        loading.value = false
      }
    }

    let interval: ReturnType<typeof setInterval> | null = null

    onMounted(() => {
      refresh()
      if (options?.autoRefresh) {
        interval = setInterval(refresh, options.autoRefresh)
      }
    })

    onUnmounted(() => {
      if (interval) clearInterval(interval)
    })

    return {
      notifications: readonly(notifications),
      unreadCount: readonly(unreadCount),
      loading: readonly(loading),
      error: readonly(error),
      refresh
    }
  }

  return {
    // Read operations
    list,
    get,
    getUnread,
    getArchived,
    countUnread,

    // Create operations
    create,
    createMany,
    sendTo,
    broadcast,

    // Update operations
    update,
    archive,
    archiveMany,
    archiveAll,
    markAsRead,
    markAsUnread,

    // Delete operations
    remove,
    removeMany,
    clearArchived,
    delete: remove, // Alias

    // Reactive hook
    useNotificationList,

    // Legacy aliases
    unreadCount: countUnread
  }
}
