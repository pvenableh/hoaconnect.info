// server/api/profile/update.patch.ts
import { createDirectus, rest, updateItem, readItem } from '@directus/sdk'
import type { UserProfile } from '~/types/directus'

export default defineEventHandler(async (event) => {
  try {
    // Get current session
    const session = await getUserSession(event)
    
    if (!session?.user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized'
      })
    }

    // Get request body
    const body = await readBody(event)
    
    // Get runtime config
    const config = useRuntimeConfig()
    
    // Create Directus client with user token
    const directus = createDirectus(config.public.directusUrl)
      .with(rest())
    
    directus.setToken(session.tokens.access_token)

    // Check if profile exists
    const profiles = await directus.request(
      rest.readItems('profiles', {
        filter: {
          user_id: {
            _eq: session.user.id
          }
        },
        limit: 1
      })
    )

    let updatedProfile: UserProfile

    if (profiles && profiles.length > 0) {
      // Update existing profile
      updatedProfile = await directus.request(
        updateItem('profiles', profiles[0].id, {
          ...body,
          date_updated: new Date().toISOString()
        })
      ) as UserProfile
    } else {
      // Create new profile
      updatedProfile = await directus.request(
        rest.createItem('profiles', {
          user_id: session.user.id,
          ...body,
          status: 'active',
          date_created: new Date().toISOString()
        })
      ) as UserProfile
    }

    // Update session with new profile data
    const updatedSession = {
      ...session,
      user: {
        ...session.user,
        profile: updatedProfile
      }
    }
    await setUserSession(event, updatedSession)

    return updatedProfile

  } catch (error: any) {
    console.error('Profile update error:', error)
    
    // Re-throw if it's already a proper error
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update profile'
    })
  }
})
