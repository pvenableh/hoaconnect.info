/**
 * Server API route for importing files from URL
 * Uses native Directus SDK importFile method
 */

import { assertFolderInCallerLibrary } from '#core/server/utils/caller-library'
import { importFile } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { url, title, description, folder } = body
    
    if (!url) {
      throw createError({
        statusCode: 400,
        message: 'URL is required'
      })
    }
    
    const directus = await getUserDirectus(event)
    
    // Build file metadata
    const metadata: Record<string, any> = {}
    if (title) metadata.title = title
    if (description) metadata.description = description
    // Directus cannot check where a new file goes; this route does.
    if (folder) {
      await assertFolderInCallerLibrary(event, folder)
      metadata.folder = folder
    }

    const result = await directus.request(
      importFile(url, metadata)
    )
    
    return result
    
  } catch (error: any) {
    console.error('File import error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to import file'
    })
  }
})
