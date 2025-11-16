/**
 * Server API route for file upload
 * Uses native Directus SDK uploadFiles method
 */

import { uploadFiles } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  try {
    const directus = await getUserDirectus(event)
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
      if (part.name !== 'file' && part.data) {
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
    
    // Create FormData for Directus SDK
    const uploadFormData = new FormData()
    
    // Add file
    const blob = new Blob([fileData.data], { type: fileData.type || 'application/octet-stream' })
    uploadFormData.append('file', blob, fileData.filename || 'upload')
    
    // Add metadata
    if (metadata.title) uploadFormData.append('title', metadata.title)
    if (metadata.description) uploadFormData.append('description', metadata.description)
    if (metadata.folder) uploadFormData.append('folder', metadata.folder)
    if (metadata.tags) uploadFormData.append('tags', JSON.stringify(metadata.tags))
    
    // Upload using SDK
    const result = await directus.request(uploadFiles(uploadFormData))
    
    return result
    
  } catch (error: any) {
    console.error('File upload error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to upload file'
    })
  }
})
