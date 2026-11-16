/**
 * Server API route for file upload.
 *
 * Stored with the app's token, which may file it in a folder (the caller's
 * own may not: PLACEMENT_FIELDS, core/shared/roles/admin-file-fields.ts), into
 * a folder this route has checked is in the caller's community library, and
 * then marked as uploaded by the caller (storeAsCaller).
 */

import { assertFolderInCallerLibrary, storeAsCaller } from '#core/server/utils/caller-library'

export default defineEventHandler(async (event) => {
  try {
    await requireUserSession(event)
    const formData = await readMultipartFormData(event)
    
    if (!formData) {
      throw createError({
        statusCode: 400,
        message: 'No file data provided'
      })
    }
    
    // Extract file and metadata from form data
    const fileData = formData.find(part => part.name === 'file')
    if (!fileData) {
      throw createError({
        statusCode: 400,
        message: 'No file found in form data'
      })
    }
    
    // Build metadata object
    const metadata: Record<string, any> = {}
    
    formData.forEach(part => {
      if (part.name && part.name !== 'file' && part.data) {
        const value = part.data.toString()
        try {
          // Try to parse as JSON (for arrays like tags)
          metadata[part.name] = JSON.parse(value)
        } catch {
          // Use as string
          metadata[part.name] = value
        }
      }
    })
    
    // Create FormData for Directus SDK. The metadata goes BEFORE the file:
    // Directus stores the file as its part arrives, with only the fields read
    // so far. With the file first, every upload lost its folder and title, and
    // a PDF in no folder is one the uploader may not read, so Directus answered
    // with no id and the document form failed ("Failed to upload document").
    const uploadFormData = new FormData()

    if (metadata.title) uploadFormData.append('title', metadata.title)
    if (metadata.description) uploadFormData.append('description', metadata.description)
    // Directus cannot check where a new file goes; this route does.
    if (metadata.folder) {
      await assertFolderInCallerLibrary(event, metadata.folder)
      uploadFormData.append('folder', metadata.folder)
    }
    if (metadata.tags) uploadFormData.append('tags', JSON.stringify(metadata.tags))

    // The file, last.
    const blob = new Blob([new Uint8Array(fileData.data)], { type: fileData.type || 'application/octet-stream' })
    uploadFormData.append('file', blob, fileData.filename || 'upload')

    // Stored with the app's token (it files the upload), as the caller's.
    return await storeAsCaller(event, { form: uploadFormData })
    
  } catch (error: any) {
    console.error('File upload error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to upload file'
    })
  }
})
