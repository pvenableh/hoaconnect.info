/**
 * useOrgItems - Organization-aware CRUD composable
 *
 * Extends useDirectusItems with automatic organization context:
 * - Auto-filters queries by current organization
 * - Auto-injects organization ID on create
 * - Provides optimistic update helpers
 * - Caches results per organization
 *
 * Usage:
 * const members = useOrgItems<HoaMember>('hoa_members')
 * const announcements = useOrgItems<Announcement>('hoa_announcements')
 */

import type { ItemsQuery } from './useDirectusItems'

interface OrgItemsOptions {
  /** Organization field name in the collection (default: 'organization') */
  orgField?: string
  /** Whether to auto-filter by org (default: true) */
  autoFilter?: boolean
  /** Whether to auto-inject org on create (default: true) */
  autoInject?: boolean
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL?: number
  /** Whether to use caching (default: true) */
  useCache?: boolean
}

export function useOrgItems<T = any>(
  collection: string,
  options: OrgItemsOptions = {}
) {
  const {
    orgField = 'organization',
    autoFilter = true,
    autoInject = true,
    cacheTTL = 5 * 60 * 1000,
    useCache: enableCache = true
  } = options

  const items = useDirectusItems<T>(collection)
  const { selectedOrg } = useSelectedOrg()
  const cache = useOrgCache()

  // Current organization ID
  const orgId = computed(() => selectedOrg.value?.id)

  /**
   * Add org filter to query
   */
  function withOrgFilter(query: ItemsQuery = {}): ItemsQuery {
    if (!autoFilter || !orgId.value) return query

    return {
      ...query,
      filter: {
        ...query.filter,
        [orgField]: { _eq: orgId.value }
      }
    }
  }

  /**
   * List items (with org filter and caching)
   */
  async function list(query: ItemsQuery = {}): Promise<T[]> {
    const orgQuery = withOrgFilter(query)

    if (enableCache) {
      const cacheKey = `${collection}:list:${JSON.stringify(orgQuery)}`
      return cache.getOrFetch(cacheKey, () => items.list(orgQuery), cacheTTL)
    }

    return items.list(orgQuery)
  }

  /**
   * Get single item
   */
  async function get(
    id: string | number,
    query: Pick<ItemsQuery, 'fields' | 'deep'> = {}
  ): Promise<T> {
    if (enableCache) {
      const cacheKey = `${collection}:get:${id}`
      return cache.getOrFetch(cacheKey, () => items.get(id, query), cacheTTL)
    }

    return items.get(id, query)
  }

  /**
   * Create item (with org injection)
   */
  async function create(
    data: Partial<T>,
    query: Pick<ItemsQuery, 'fields'> = {}
  ): Promise<T> {
    let itemData = data

    // Auto-inject organization ID
    if (autoInject && orgId.value) {
      itemData = {
        ...data,
        [orgField]: orgId.value
      }
    }

    const result = await items.create(itemData, query)

    // Invalidate list cache
    cache.invalidatePattern(`^${collection}:list:`)

    return result
  }

  /**
   * Update item
   */
  async function update(
    id: string | number,
    data: Partial<T>,
    query: Pick<ItemsQuery, 'fields'> = {}
  ): Promise<T> {
    const result = await items.update(id, data, query)

    // Invalidate caches
    cache.invalidate(`${collection}:get:${id}`)
    cache.invalidatePattern(`^${collection}:list:`)

    return result
  }

  /**
   * Delete item(s)
   */
  async function remove(id: string | number | (string | number)[]): Promise<boolean> {
    const result = await items.remove(id)

    // Invalidate caches
    const ids = Array.isArray(id) ? id : [id]
    ids.forEach(itemId => cache.invalidate(`${collection}:get:${itemId}`))
    cache.invalidatePattern(`^${collection}:list:`)

    return result
  }

  /**
   * Count items (with org filter)
   */
  async function count(filter?: Record<string, any>): Promise<number> {
    const orgFilter = autoFilter && orgId.value
      ? { ...filter, [orgField]: { _eq: orgId.value } }
      : filter

    if (enableCache) {
      const cacheKey = `${collection}:count:${JSON.stringify(orgFilter)}`
      return cache.getOrFetch(cacheKey, () => items.count(orgFilter), cacheTTL)
    }

    return items.count(orgFilter)
  }

  /**
   * Aggregate with org filter
   */
  async function aggregate(
    query: Pick<ItemsQuery, 'aggregate' | 'groupBy' | 'filter'>
  ) {
    return items.aggregate({
      ...query,
      filter: autoFilter && orgId.value
        ? { ...query.filter, [orgField]: { _eq: orgId.value } }
        : query.filter
    })
  }

  /**
   * Refresh cache for this collection
   */
  function refresh(): void {
    cache.invalidatePattern(`^${collection}:`)
  }

  /**
   * Subscribe to real-time updates for this collection
   */
  function useSubscription(subscriptionOptions?: {
    fields?: string[]
    additionalFilter?: Record<string, any>
  }) {
    return useDirectusSubscription<T>(collection, {
      fields: subscriptionOptions?.fields,
      filter: autoFilter && orgId.value
        ? {
            [orgField]: { _eq: orgId.value },
            ...subscriptionOptions?.additionalFilter
          }
        : subscriptionOptions?.additionalFilter,
      immediate: true
    })
  }

  return {
    // CRUD operations
    list,
    get,
    create,
    update,
    remove,
    delete: remove,
    count,
    aggregate,

    // Cache management
    refresh,

    // Real-time
    useSubscription,

    // Context
    orgId,
    orgField
  }
}

/**
 * Pre-configured org-aware composables for common collections
 */

// HOA Members
export function useOrgMembers() {
  return useOrgItems('hoa_members')
}

// Announcements
export function useOrgAnnouncements() {
  return useOrgItems('hoa_announcements')
}

// Documents
export function useOrgDocuments() {
  return useOrgItems('hoa_documents')
}

// Calendar Events
export function useOrgEvents() {
  return useOrgItems('hoa_calendar_events')
}

// Violations
export function useOrgViolations() {
  return useOrgItems('hoa_violations')
}

// Work Orders
export function useOrgWorkOrders() {
  return useOrgItems('hoa_work_orders')
}
