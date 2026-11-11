/**
 * Server API route for file operations
 * Uses native Directus SDK methods for file management
 */

import {
  readFiles,
  readFile,
  uploadFiles,
  updateFile,
  deleteFile,
  deleteFiles,
  importFile
} from '@directus/sdk'
import { GOVERNING_FILE_ELSEWHERE, GOVERNING_FILE_PREFIX, NOT_GOVERNING_FILE } from '#core/shared/governing/files'

/**
 * Is any of these a governing original or page image? Read with the app's
 * token, so the answer does not depend on what the caller's role may see.
 * Governing files are listed, changed and removed only on the governing
 * pages, which audit each change.
 */
async function anyGoverningFile(ids: unknown): Promise<boolean> {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((id): id is string => typeof id === 'string')
  if (!list.length) return false
  const rows = (await getTypedDirectus().request(
    readFiles({
      filter: { _and: [{ id: { _in: list } }, { description: { _starts_with: GOVERNING_FILE_PREFIX } }] },
      fields: ['id'],
      limit: -1
    } as any)
  )) as unknown[]
  return rows.length > 0
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { operation, id, data, query } = body
    
    if (!operation) {
      throw createError({
        statusCode: 400,
        message: 'Operation is required'
      })
    }
    
    const directus = await getUserDirectus(event)
    
    switch (operation) {
      case 'list': {
        const q = (query || {}) as Record<string, any>
        return await directus.request(
          readFiles({ ...q, filter: q.filter ? { _and: [q.filter, NOT_GOVERNING_FILE] } : NOT_GOVERNING_FILE })
        )
      }
      
      case 'get':
        if (!id) throw new Error('File ID required for get operation')
        if (await anyGoverningFile(id)) throw createError({ statusCode: 404, message: 'File not found' })
        return await directus.request(
          readFile(id, query || {})
        )
      
      case 'update':
        if (!id) throw new Error('File ID required for update operation')
        if (!data) throw new Error('Data required for update operation')
        if (await anyGoverningFile(id)) throw createError({ statusCode: 409, message: GOVERNING_FILE_ELSEWHERE })
        return await directus.request(
          updateFile(id, data)
        )
      
      case 'delete':
        if (!id) throw new Error('File ID required for delete operation')
        if (await anyGoverningFile(id)) throw createError({ statusCode: 409, message: GOVERNING_FILE_ELSEWHERE })

        if (Array.isArray(id)) {
          await directus.request(deleteFiles(id))
          return { deleted: id.length }
        } else {
          await directus.request(deleteFile(id))
          return { deleted: 1 }
        }
      
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
    
  } catch (error: any) {
    console.error('Directus files API error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to perform file operation'
    })
  }
})
