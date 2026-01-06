/**
 * useDirectusRevisions - Revision history composable
 *
 * Handles revision/version history queries using Directus SDK methods
 * Revisions are read-only (created automatically by Directus)
 *
 * Usage:
 * const { list, get, getForItem, getLatest, compare } = useDirectusRevisions()
 */

interface DirectusRevision {
  id: number
  activity: number
  collection: string
  item: string
  data: Record<string, any>
  delta: Record<string, any>
  parent: number | null
  version: string | null
}

interface ItemsQuery {
  filter?: Record<string, any>
  fields?: string[]
  sort?: string[]
  limit?: number
  offset?: number
}

export const useDirectusRevisions = () => {
  const items = useDirectusItems<DirectusRevision>('directus_revisions')

  /**
   * List revisions with optional filtering
   */
  const list = async (query?: ItemsQuery): Promise<DirectusRevision[]> => {
    return await items.list({
      sort: ['-id'],
      ...query
    })
  }

  /**
   * Get single revision by ID
   */
  const get = async (id: number, query?: ItemsQuery): Promise<DirectusRevision> => {
    return await items.get(id, query)
  }

  /**
   * Get revisions for a specific item
   */
  const getForItem = async (
    collection: string,
    itemId: string,
    query?: ItemsQuery
  ): Promise<DirectusRevision[]> => {
    return await items.list({
      filter: {
        collection: { _eq: collection },
        item: { _eq: itemId }
      },
      sort: ['-id'],
      ...query
    })
  }

  /**
   * Get the latest revision for an item
   */
  const getLatest = async (
    collection: string,
    itemId: string
  ): Promise<DirectusRevision | null> => {
    const revisions = await getForItem(collection, itemId, { limit: 1 })
    return revisions[0] || null
  }

  /**
   * Compare two revisions and return the differences
   */
  const compare = async (
    revisionId1: number,
    revisionId2: number
  ): Promise<Record<string, { old: any; new: any }> | null> => {
    const [rev1, rev2] = await Promise.all([
      get(revisionId1),
      get(revisionId2)
    ])

    if (!rev1 || !rev2) return null

    const changes: Record<string, { old: any; new: any }> = {}
    const allKeys = new Set([
      ...Object.keys(rev1.data || {}),
      ...Object.keys(rev2.data || {})
    ])

    for (const key of allKeys) {
      const val1 = rev1.data?.[key]
      const val2 = rev2.data?.[key]
      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        changes[key] = { old: val1, new: val2 }
      }
    }

    return changes
  }

  /**
   * Get revision count for an item
   */
  const countForItem = async (
    collection: string,
    itemId: string
  ): Promise<number> => {
    return await items.count({
      collection: { _eq: collection },
      item: { _eq: itemId }
    })
  }

  /**
   * Get revisions by collection
   */
  const getByCollection = async (
    collection: string,
    query?: ItemsQuery
  ): Promise<DirectusRevision[]> => {
    return await items.list({
      filter: {
        collection: { _eq: collection }
      },
      sort: ['-id'],
      ...query
    })
  }

  /**
   * Get item data at a specific revision
   */
  const getItemAtRevision = async (revisionId: number): Promise<Record<string, any> | null> => {
    const revision = await get(revisionId)
    return revision?.data || null
  }

  /**
   * Get all changes (deltas) for an item
   */
  const getDeltas = async (
    collection: string,
    itemId: string,
    query?: ItemsQuery
  ): Promise<{ id: number; delta: Record<string, any> }[]> => {
    const revisions = await getForItem(collection, itemId, {
      fields: ['id', 'delta'],
      ...query
    })
    return revisions.map(r => ({ id: r.id, delta: r.delta }))
  }

  return {
    // Core methods
    list,
    get,

    // Item-specific methods
    getForItem,
    getLatest,
    countForItem,
    getItemAtRevision,
    getDeltas,

    // Collection methods
    getByCollection,

    // Comparison
    compare
  }
}
