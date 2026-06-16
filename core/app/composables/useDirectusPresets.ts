/**
 * useDirectusPresets - Presets (saved filters/bookmarks) composable
 *
 * Handles preset management for saved views and bookmarks
 * Presets can be user-specific, role-specific, or global
 *
 * Usage:
 * const { list, get, create, update, remove, getBookmarks, createBookmark } = useDirectusPresets()
 */

interface DirectusPreset {
  id: number
  bookmark: string | null
  user: string | null
  role: string | null
  collection: string
  search: string | null
  layout: string | null
  layout_query: Record<string, any> | null
  layout_options: Record<string, any> | null
  refresh_interval: number | null
  filter: Record<string, any> | null
  icon: string
  color: string | null
}

interface ItemsQuery {
  filter?: Record<string, any>
  fields?: string[]
  sort?: string[]
  limit?: number
  offset?: number
}

export const useDirectusPresets = () => {
  const items = useDirectusItems<DirectusPreset>('directus_presets')

  /**
   * List presets with optional filtering
   */
  const list = async (query?: ItemsQuery): Promise<DirectusPreset[]> => {
    return await items.list(query)
  }

  /**
   * Get single preset by ID
   */
  const get = async (id: number, query?: ItemsQuery): Promise<DirectusPreset> => {
    return await items.get(id, query)
  }

  /**
   * Get presets for a specific collection
   */
  const getForCollection = async (collection: string): Promise<DirectusPreset[]> => {
    return await items.list({
      filter: { collection: { _eq: collection } }
    })
  }

  /**
   * Get all bookmarks (presets with bookmark name)
   */
  const getBookmarks = async (): Promise<DirectusPreset[]> => {
    return await items.list({
      filter: { bookmark: { _nnull: true } }
    })
  }

  /**
   * Get bookmarks for a specific collection
   */
  const getBookmarksForCollection = async (collection: string): Promise<DirectusPreset[]> => {
    return await items.list({
      filter: {
        bookmark: { _nnull: true },
        collection: { _eq: collection }
      }
    })
  }

  /**
   * Create a new preset
   */
  const create = async (data: Partial<DirectusPreset>): Promise<DirectusPreset> => {
    return await items.create(data)
  }

  /**
   * Create a bookmark (preset with name)
   */
  const createBookmark = async (
    collection: string,
    name: string,
    filter?: Record<string, any>,
    options?: Partial<DirectusPreset>
  ): Promise<DirectusPreset> => {
    return await create({
      collection,
      bookmark: name,
      filter,
      icon: options?.icon || 'bookmark',
      color: options?.color,
      layout: options?.layout,
      layout_query: options?.layout_query,
      layout_options: options?.layout_options,
      ...options
    })
  }

  /**
   * Update a preset
   */
  const update = async (
    id: number,
    data: Partial<DirectusPreset>
  ): Promise<DirectusPreset> => {
    return await items.update(id, data)
  }

  /**
   * Rename a bookmark
   */
  const renameBookmark = async (
    id: number,
    newName: string
  ): Promise<DirectusPreset> => {
    return await update(id, { bookmark: newName })
  }

  /**
   * Update bookmark filter
   */
  const updateBookmarkFilter = async (
    id: number,
    filter: Record<string, any>
  ): Promise<DirectusPreset> => {
    return await update(id, { filter })
  }

  /**
   * Delete a preset
   */
  const remove = async (id: number): Promise<boolean> => {
    await items.remove(id)
    return true
  }

  /**
   * Get user's personal presets
   */
  const getMyPresets = async (userId: string): Promise<DirectusPreset[]> => {
    return await items.list({
      filter: { user: { _eq: userId } }
    })
  }

  /**
   * Get presets for a specific role
   */
  const getForRole = async (roleId: string): Promise<DirectusPreset[]> => {
    return await items.list({
      filter: { role: { _eq: roleId } }
    })
  }

  /**
   * Get global presets (no user or role)
   */
  const getGlobalPresets = async (): Promise<DirectusPreset[]> => {
    return await items.list({
      filter: {
        user: { _null: true },
        role: { _null: true }
      }
    })
  }

  /**
   * Duplicate a preset
   */
  const duplicate = async (
    id: number,
    overrides?: Partial<DirectusPreset>
  ): Promise<DirectusPreset> => {
    const original = await get(id)
    const { id: _id, ...data } = original

    return await create({
      ...data,
      bookmark: data.bookmark ? `${data.bookmark} (copy)` : null,
      ...overrides
    })
  }

  return {
    // Core CRUD
    list,
    get,
    create,
    update,
    remove,
    delete: remove, // Alias

    // Bookmark operations
    getBookmarks,
    getBookmarksForCollection,
    createBookmark,
    renameBookmark,
    updateBookmarkFilter,

    // Query methods
    getForCollection,
    getMyPresets,
    getForRole,
    getGlobalPresets,

    // Utilities
    duplicate
  }
}
