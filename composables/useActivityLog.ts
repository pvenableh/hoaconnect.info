import { createDirectus, authentication, rest, readActivities } from '@directus/sdk'
import type { DirectusSchema } from '~/types/directus-schema'

/**
 * Composable for querying Directus native activity collection
 *
 * Directus automatically tracks all activities including:
 * - create, update, delete operations
 * - login, logout events
 * - comments
 *
 * No manual logging required - Directus handles it automatically.
 *
 * @example
 * ```ts
 * const { getRecentActivity, getUserActivity, getCollectionActivity } = useActivityLog()
 *
 * // Get recent activities
 * const activities = await getRecentActivity(50)
 *
 * // Get activities for a specific user
 * const userActivities = await getUserActivity('user-id')
 *
 * // Get activities for specific collections
 * const hoaActivities = await getCollectionActivity(['hoa_members', 'hoa_organizations'])
 * ```
 */
export const useActivityLog = () => {
  const config = useRuntimeConfig()

  /**
   * Get authenticated Directus client
   */
  const getClient = () => {
    return createDirectus<DirectusSchema>(config.public.directus.url)
      .with(authentication('session'))
      .with(rest())
  }

  /**
   * Get recent activities across all collections
   * @param limit Number of activities to fetch (default: 50)
   * @param collections Optional array of collection names to filter by
   */
  const getRecentActivity = async (
    limit = 50,
    collections?: string[]
  ) => {
    try {
      const client = getClient()

      const query: any = {
        limit,
        sort: ['-timestamp'],
      }

      if (collections && collections.length > 0) {
        query.filter = {
          collection: { _in: collections }
        }
      }

      const activities = await client.request(readActivities(query))

      return activities || []
    } catch (error) {
      console.error('Error fetching recent activities:', error)
      return []
    }
  }

  /**
   * Get activities for a specific user
   * @param userId User ID to filter activities
   * @param limit Number of activities to fetch (default: 50)
   */
  const getUserActivity = async (
    userId: string,
    limit = 50
  ) => {
    try {
      const client = getClient()

      const activities = await client.request(
        readActivities({
          limit,
          sort: ['-timestamp'],
          filter: {
            user: { _eq: userId }
          }
        })
      )

      return activities || []
    } catch (error) {
      console.error('Error fetching user activities:', error)
      return []
    }
  }

  /**
   * Get activities for specific collections (e.g., HOA-related)
   * @param collections Array of collection names
   * @param limit Number of activities to fetch (default: 50)
   */
  const getCollectionActivity = async (
    collections: string[],
    limit = 50
  ) => {
    try {
      const client = getClient()

      const activities = await client.request(
        readActivities({
          limit,
          sort: ['-timestamp'],
          filter: {
            collection: { _in: collections }
          }
        })
      )

      return activities || []
    } catch (error) {
      console.error('Error fetching collection activities:', error)
      return []
    }
  }

  /**
   * Get activities for a specific action type
   * @param action Action type (create, update, delete, login, logout, comment)
   * @param limit Number of activities to fetch (default: 50)
   */
  const getActivityByAction = async (
    action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'comment',
    limit = 50
  ) => {
    try {
      const client = getClient()

      const activities = await client.request(
        readActivities({
          limit,
          sort: ['-timestamp'],
          filter: {
            action: { _eq: action }
          }
        })
      )

      return activities || []
    } catch (error) {
      console.error('Error fetching activities by action:', error)
      return []
    }
  }

  /**
   * Get activities for a specific item
   * @param collection Collection name
   * @param itemId Item ID
   */
  const getItemActivity = async (
    collection: string,
    itemId: string
  ) => {
    try {
      const client = getClient()

      const activities = await client.request(
        readActivities({
          sort: ['-timestamp'],
          filter: {
            collection: { _eq: collection },
            item: { _eq: itemId }
          }
        })
      )

      return activities || []
    } catch (error) {
      console.error('Error fetching item activities:', error)
      return []
    }
  }

  /**
   * Get login activities for security monitoring
   * @param limit Number of activities to fetch (default: 50)
   */
  const getLoginActivity = async (limit = 50) => {
    return getActivityByAction('login', limit)
  }

  /**
   * Get HOA-specific activities (members, organizations, invitations)
   * @param limit Number of activities to fetch (default: 50)
   */
  const getHOAActivity = async (limit = 50) => {
    return getCollectionActivity(
      ['hoa_members', 'hoa_organizations', 'hoa_invitations', 'hoa_units', 'hoa_documents'],
      limit
    )
  }

  return {
    getRecentActivity,
    getUserActivity,
    getCollectionActivity,
    getActivityByAction,
    getItemActivity,
    getLoginActivity,
    getHOAActivity,
  }
}
