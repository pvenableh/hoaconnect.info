// server/api/profile/update.patch.ts
// NOTE: The profiles collection has been removed.
// User profile data is now stored in directus_users (for system-level data)
// and hoa_members (for organization-specific data).
// This endpoint is deprecated and should be removed or updated to use directus_users.

export default defineEventHandler(async (event) => {
  throw createError({
    statusCode: 410,
    statusMessage: 'This endpoint is no longer available. The profiles collection has been removed. Please update user data through the appropriate endpoints.'
  })
})
