/**
 * useDirectusFolders - Folder operations composable
 *
 * Handles folder management operations (create, read, update, delete)
 * using native Directus SDK methods
 *
 * Usage:
 * const { list, get, create, update, remove, createMultiple, updateMultiple, deleteMultiple } = useDirectusFolders()
 */

export const useDirectusFolders = () => {
  const { loggedIn } = useUserSession()

  /**
   * List folders with optional filtering
   */
  const list = async (query?: {
    filter?: Record<string, any>
    fields?: string[]
    sort?: string[]
    limit?: number
    offset?: number
    search?: string
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const { data, error } = await useFetch('/api/directus/folders', {
      method: 'POST',
      body: {
        operation: 'list',
        query
      }
    })

    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch folders')
    }

    return data.value
  }

  /**
   * Get single folder by ID
   */
  const get = async (folderId: string, query?: {
    fields?: string[]
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const { data, error } = await useFetch('/api/directus/folders', {
      method: 'POST',
      body: {
        operation: 'get',
        id: folderId,
        query
      }
    })

    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch folder')
    }

    return data.value
  }

  /**
   * Create a single folder
   */
  const create = async (folderData: {
    name: string
    parent?: string | null
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const { data, error } = await useFetch('/api/directus/folders', {
      method: 'POST',
      body: {
        operation: 'create',
        data: folderData
      }
    })

    if (error.value) {
      throw new Error(error.value.message || 'Failed to create folder')
    }

    return data.value
  }

  /**
   * Create multiple folders
   */
  const createMultiple = async (folders: Array<{
    name: string
    parent?: string | null
  }>) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const { data, error } = await useFetch('/api/directus/folders', {
      method: 'POST',
      body: {
        operation: 'createMultiple',
        data: folders
      }
    })

    if (error.value) {
      throw new Error(error.value.message || 'Failed to create folders')
    }

    return data.value
  }

  /**
   * Update single folder
   */
  const update = async (folderId: string, updates: {
    name?: string
    parent?: string | null
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const { data, error } = await useFetch('/api/directus/folders', {
      method: 'POST',
      body: {
        operation: 'update',
        id: folderId,
        data: updates
      }
    })

    if (error.value) {
      throw new Error(error.value.message || 'Failed to update folder')
    }

    return data.value
  }

  /**
   * Update multiple folders
   */
  const updateMultiple = async (folderIds: string[], updates: {
    name?: string
    parent?: string | null
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const { data, error } = await useFetch('/api/directus/folders', {
      method: 'POST',
      body: {
        operation: 'updateMultiple',
        ids: folderIds,
        data: updates
      }
    })

    if (error.value) {
      throw new Error(error.value.message || 'Failed to update folders')
    }

    return data.value
  }

  /**
   * Delete single folder
   */
  const remove = async (folderId: string) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const { error } = await useFetch('/api/directus/folders', {
      method: 'POST',
      body: {
        operation: 'delete',
        id: folderId
      }
    })

    if (error.value) {
      throw new Error(error.value.message || 'Failed to delete folder')
    }

    return true
  }

  /**
   * Delete multiple folders
   */
  const deleteMultiple = async (folderIds: string[]) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const { error } = await useFetch('/api/directus/folders', {
      method: 'POST',
      body: {
        operation: 'deleteMultiple',
        ids: folderIds
      }
    })

    if (error.value) {
      throw new Error(error.value.message || 'Failed to delete folders')
    }

    return true
  }

  /**
   * Get folders by parent
   * Useful for building folder trees
   */
  const getByParent = async (parentId: string | null, query?: {
    fields?: string[]
    sort?: string[]
    limit?: number
  }) => {
    const filter = parentId
      ? { parent: { _eq: parentId } }
      : { parent: { _null: true } }

    return await list({
      filter,
      ...query
    })
  }

  /**
   * Get root folders (folders without parent)
   */
  const getRootFolders = async (query?: {
    fields?: string[]
    sort?: string[]
    limit?: number
  }) => {
    return await getByParent(null, query)
  }

  /**
   * Get folder tree starting from a specific folder
   * Recursively fetches all subfolders
   */
  const getTree = async (parentId: string | null = null): Promise<any[]> => {
    const folders = await getByParent(parentId, {
      fields: ['id', 'name', 'parent'],
      sort: ['name']
    })

    if (!folders || !Array.isArray(folders)) {
      return []
    }

    // Recursively get children for each folder
    const foldersWithChildren = await Promise.all(
      folders.map(async (folder: any) => ({
        ...folder,
        children: await getTree(folder.id)
      }))
    )

    return foldersWithChildren
  }

  return {
    // Single operations
    list,
    get,
    create,
    update,
    remove,
    delete: remove, // Alias

    // Batch operations
    createMultiple,
    updateMultiple,
    deleteMultiple,

    // Helper methods
    getByParent,
    getRootFolders,
    getTree
  }
}
