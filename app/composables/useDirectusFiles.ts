/**
 * useDirectusFiles - File operations composable
 * 
 * Handles file uploads, downloads, updates, and deletions
 * using native Directus SDK methods
 * 
 * Usage:
 * const { list, get, upload, update, remove, getUrl } = useDirectusFiles()
 */

export const useDirectusFiles = () => {
  const config = useRuntimeConfig()
  const { loggedIn } = useUserSession()
  
  /**
   * Get file URL with optional transformations
   */
  const getUrl = (fileId: string, options?: {
    width?: number
    height?: number
    fit?: 'cover' | 'contain' | 'inside' | 'outside'
    quality?: number
    format?: 'jpg' | 'png' | 'webp' | 'tiff'
  }) => {
    if (!fileId) return null
    
    const baseUrl = `${config.public.directus.url}/assets/${fileId}`
    
    if (!options) return baseUrl
    
    const params = new URLSearchParams()
    if (options.width) params.append('width', options.width.toString())
    if (options.height) params.append('height', options.height.toString())
    if (options.fit) params.append('fit', options.fit)
    if (options.quality) params.append('quality', options.quality.toString())
    if (options.format) params.append('format', options.format)
    
    return `${baseUrl}?${params.toString()}`
  }
  
  /**
   * List files with optional filtering
   */
  const list = async (query?: {
    filter?: Record<string, any>
    fields?: string[]
    sort?: string[]
    limit?: number
    search?: string
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/files', {
      method: 'POST',
      body: {
        operation: 'list',
        query
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch files')
    }
    
    return data.value
  }
  
  /**
   * Get single file metadata
   */
  const get = async (fileId: string, fields?: string[]) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/files', {
      method: 'POST',
      body: {
        operation: 'get',
        id: fileId,
        query: { fields }
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch file')
    }
    
    return data.value
  }
  
  /**
   * Upload a file
   */
  const upload = async (file: File, metadata?: {
    title?: string
    description?: string
    folder?: string
    tags?: string[]
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const formData = new FormData()
    formData.append('file', file)
    
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined) {
          formData.append(key, Array.isArray(value) ? JSON.stringify(value) : value)
        }
      })
    }
    
    const { data, error } = await useFetch('/api/directus/files/upload', {
      method: 'POST',
      body: formData
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to upload file')
    }
    
    return data.value
  }
  
  /**
   * Update file metadata
   */
  const update = async (fileId: string, updates: {
    title?: string
    description?: string
    folder?: string
    tags?: string[]
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/files', {
      method: 'POST',
      body: {
        operation: 'update',
        id: fileId,
        data: updates
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to update file')
    }
    
    return data.value
  }
  
  /**
   * Delete file
   */
  const remove = async (fileId: string | string[]) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { error } = await useFetch('/api/directus/files', {
      method: 'POST',
      body: {
        operation: 'delete',
        id: fileId
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to delete file')
    }
    
    return true
  }
  
  /**
   * Import file from URL
   */
  const importFromUrl = async (url: string, metadata?: {
    title?: string
    description?: string
    folder?: string
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const { data, error } = await useFetch('/api/directus/files/import', {
      method: 'POST',
      body: {
        url,
        ...metadata
      }
    })

    if (error.value) {
      throw new Error(error.value.message || 'Failed to import file')
    }

    return data.value
  }

  /**
   * List files by folder
   */
  const listByFolder = async (folderId: string | null, query?: {
    fields?: string[]
    sort?: string[]
    limit?: number
    search?: string
  }) => {
    const filter = folderId
      ? { folder: { _eq: folderId } }
      : { folder: { _null: true } }

    return await list({
      filter,
      ...query
    })
  }

  /**
   * Get files in root folder (no folder assigned)
   */
  const listRootFiles = async (query?: {
    fields?: string[]
    sort?: string[]
    limit?: number
    search?: string
  }) => {
    return await listByFolder(null, query)
  }

  /**
   * Move file(s) to a folder
   */
  const moveToFolder = async (fileId: string | string[], folderId: string | null) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }

    const fileIds = Array.isArray(fileId) ? fileId : [fileId]

    // Update each file's folder
    const promises = fileIds.map(id => update(id, { folder: folderId }))

    const results = await Promise.all(promises)

    return Array.isArray(fileId) ? results : results[0]
  }

  /**
   * Count files in a folder
   */
  const countInFolder = async (folderId: string | null) => {
    const filter = folderId
      ? { folder: { _eq: folderId } }
      : { folder: { _null: true } }

    const result = await list({
      filter,
      fields: ['id'],
      limit: -1
    })

    return Array.isArray(result) ? result.length : 0
  }

  return {
    // Basic operations
    list,
    get,
    upload,
    update,
    remove,
    delete: remove, // Alias
    importFromUrl,
    getUrl,

    // Folder operations
    listByFolder,
    listRootFiles,
    moveToFolder,
    countInFolder
  }
}
