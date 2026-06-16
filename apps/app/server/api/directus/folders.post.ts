/**
 * Server API route for folder operations
 * Uses native Directus SDK methods for folder management
 */

import {
  readFolders,
  readFolder,
  createFolder,
  createFolders,
  updateFolder,
  updateFolders,
  deleteFolder,
  deleteFolders
} from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { operation, id, ids, data, query } = body

    if (!operation) {
      throw createError({
        statusCode: 400,
        message: 'Operation is required'
      })
    }

    const directus = await getUserDirectus(event)

    switch (operation) {
      case 'list':
        return await directus.request(
          readFolders(query || {})
        )

      case 'get':
        if (!id) throw new Error('Folder ID required for get operation')
        return await directus.request(
          readFolder(id, query || {})
        )

      case 'create':
        if (!data) throw new Error('Data required for create operation')
        return await directus.request(
          createFolder(data)
        )

      case 'createMultiple':
        if (!data || !Array.isArray(data)) {
          throw new Error('Array of folder objects required for createMultiple operation')
        }
        return await directus.request(
          createFolders(data)
        )

      case 'update':
        if (!id) throw new Error('Folder ID required for update operation')
        if (!data) throw new Error('Data required for update operation')
        return await directus.request(
          updateFolder(id, data)
        )

      case 'updateMultiple':
        if (!ids || !Array.isArray(ids)) {
          throw new Error('Array of folder IDs required for updateMultiple operation')
        }
        if (!data) throw new Error('Data required for updateMultiple operation')
        return await directus.request(
          updateFolders(ids, data)
        )

      case 'delete':
        if (!id) throw new Error('Folder ID required for delete operation')
        await directus.request(deleteFolder(id))
        return { deleted: 1 }

      case 'deleteMultiple':
        if (!ids || !Array.isArray(ids)) {
          throw new Error('Array of folder IDs required for deleteMultiple operation')
        }
        await directus.request(deleteFolders(ids))
        return { deleted: ids.length }

      default:
        throw new Error(`Unknown operation: ${operation}`)
    }

  } catch (error: any) {
    console.error('Directus folders API error:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to perform folder operation'
    })
  }
})
