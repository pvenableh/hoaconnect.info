/**
 * Server API route for importing files from URL. Stored with the app's token
 * into a checked folder, as the caller's (see files/upload.post.ts).
 */

import { assertFolderInCallerLibrary, storeAsCaller } from '#core/server/utils/caller-library'

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
    
    await requireUserSession(event)

    // Build file metadata
    const metadata: Record<string, any> = {}
    if (title) metadata.title = title
    if (description) metadata.description = description
    // Directus cannot check where a new file goes; this route does.
    if (folder) {
      await assertFolderInCallerLibrary(event, folder)
      metadata.folder = folder
    }

    return await storeAsCaller(event, { url, data: metadata })
    
  } catch (error: any) {
    console.error('File import error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to import file'
    })
  }
})
