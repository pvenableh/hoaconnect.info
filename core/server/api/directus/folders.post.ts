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
import { assertFolderInCallerLibrary, assertFolderMove } from '#core/server/utils/caller-library'
import { forgetFolderParent } from '#core/server/utils/org-storage'

// Where a folder sits is the app's to write: Directus cannot check a placement,
// so the caller's own token may not set `parent` (PLACEMENT_FIELDS,
// core/shared/roles/admin-file-fields.ts). New folders and moves are checked
// here and written with the app's token; a rename stays on the caller's.

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
        await assertFolderInCallerLibrary(event, data.parent)
        return await getTypedDirectus().request(
          createFolder(data)
        )

      case 'createMultiple':
        if (!data || !Array.isArray(data)) {
          throw new Error('Array of folder objects required for createMultiple operation')
        }
        for (const folder of data) await assertFolderInCallerLibrary(event, folder?.parent)
        return await getTypedDirectus().request(
          createFolders(data)
        )

      case 'update':
        if (!id) throw new Error('Folder ID required for update operation')
        if (!data) throw new Error('Data required for update operation')
        if ('parent' in data) {
          await assertFolderMove(event, id, data.parent)
          const { parent, ...rest } = data
          if (Object.keys(rest).length) await directus.request(updateFolder(id, rest))
          const moved = await getTypedDirectus().request(updateFolder(id, { parent }))
          forgetFolderParent(id)
          return moved
        }
        return await directus.request(
          updateFolder(id, data)
        )

      case 'updateMultiple':
        if (!ids || !Array.isArray(ids)) {
          throw new Error('Array of folder IDs required for updateMultiple operation')
        }
        if (!data) throw new Error('Data required for updateMultiple operation')
        if ('parent' in data) {
          for (const one of ids) await assertFolderMove(event, one, data.parent)
          const { parent, ...rest } = data
          if (Object.keys(rest).length) await directus.request(updateFolders(ids, rest))
          const moved = await getTypedDirectus().request(updateFolders(ids, { parent }))
          ids.forEach(forgetFolderParent)
          return moved
        }
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
