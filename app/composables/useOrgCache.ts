/**
 * useOrgCache - Organization-scoped data caching
 *
 * Provides efficient caching for organization-specific data to minimize
 * redundant API calls across components and page navigations.
 *
 * Features:
 * - Automatic cache invalidation on org change
 * - TTL-based expiration
 * - Deduplication of concurrent requests
 *
 * Usage:
 * const { get, set, invalidate, invalidateAll } = useOrgCache()
 */

interface CacheEntry<T = any> {
  data: T
  timestamp: number
  orgId: string
}

// Global cache store (persists across component instances)
const cacheStore = new Map<string, CacheEntry>()
const pendingRequests = new Map<string, Promise<any>>()

// Default TTL: 5 minutes
const DEFAULT_TTL = 5 * 60 * 1000

export function useOrgCache() {
  const { selectedOrg } = useSelectedOrg()

  /**
   * Get current organization ID
   */
  const currentOrgId = computed(() => selectedOrg.value?.id)

  /**
   * Generate cache key with org scope
   */
  function getCacheKey(key: string, orgId?: string): string {
    const org = orgId || currentOrgId.value
    return org ? `${org}:${key}` : key
  }

  /**
   * Get cached data if valid
   */
  function get<T>(key: string, ttl: number = DEFAULT_TTL): T | null {
    const cacheKey = getCacheKey(key)
    const entry = cacheStore.get(cacheKey)

    if (!entry) return null

    // Check if cache is for current org
    if (currentOrgId.value && entry.orgId !== currentOrgId.value) {
      cacheStore.delete(cacheKey)
      return null
    }

    // Check TTL
    if (Date.now() - entry.timestamp > ttl) {
      cacheStore.delete(cacheKey)
      return null
    }

    return entry.data as T
  }

  /**
   * Set cache data
   */
  function set<T>(key: string, data: T): void {
    const cacheKey = getCacheKey(key)
    cacheStore.set(cacheKey, {
      data,
      timestamp: Date.now(),
      orgId: currentOrgId.value || ''
    })
  }

  /**
   * Get or fetch with deduplication
   * Prevents multiple concurrent requests for the same data
   */
  async function getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = DEFAULT_TTL
  ): Promise<T> {
    // Check cache first
    const cached = get<T>(key, ttl)
    if (cached !== null) return cached

    const cacheKey = getCacheKey(key)

    // Check for pending request
    const pending = pendingRequests.get(cacheKey)
    if (pending) return pending as Promise<T>

    // Create new request
    const request = fetcher()
      .then(data => {
        set(key, data)
        return data
      })
      .finally(() => {
        pendingRequests.delete(cacheKey)
      })

    pendingRequests.set(cacheKey, request)
    return request
  }

  /**
   * Invalidate specific cache key
   */
  function invalidate(key: string): void {
    const cacheKey = getCacheKey(key)
    cacheStore.delete(cacheKey)
    pendingRequests.delete(cacheKey)
  }

  /**
   * Invalidate all cache for current org
   */
  function invalidateAll(): void {
    const orgId = currentOrgId.value
    if (!orgId) {
      cacheStore.clear()
      pendingRequests.clear()
      return
    }

    for (const [key, entry] of cacheStore) {
      if (entry.orgId === orgId) {
        cacheStore.delete(key)
      }
    }

    for (const key of pendingRequests.keys()) {
      if (key.startsWith(`${orgId}:`)) {
        pendingRequests.delete(key)
      }
    }
  }

  /**
   * Invalidate cache by pattern
   */
  function invalidatePattern(pattern: string): void {
    const orgId = currentOrgId.value
    const regex = new RegExp(pattern)

    for (const key of cacheStore.keys()) {
      if (regex.test(key) && (!orgId || key.startsWith(`${orgId}:`))) {
        cacheStore.delete(key)
      }
    }
  }

  // Watch for org changes and invalidate
  watch(currentOrgId, (newOrg, oldOrg) => {
    if (newOrg !== oldOrg) {
      // Don't clear cache - just mark as stale
      // Data will be refetched on next access
    }
  })

  return {
    get,
    set,
    getOrFetch,
    invalidate,
    invalidateAll,
    invalidatePattern,
    currentOrgId
  }
}
