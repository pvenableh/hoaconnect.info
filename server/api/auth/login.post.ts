// server/api/auth/login.post.ts
import { createDirectus, authentication, rest, readMe, readItem } from '@directus/sdk'
import { loginSchema } from '~/schemas/auth'
import type { DirectusUser, UserProfile, SessionUser } from '~/types/directus'

export default defineEventHandler(async (event) => {
  try {
    // Validate request body
    const body = await readBody(event)
    const validatedData = loginSchema.parse(body)

    // Get runtime config
    const config = useRuntimeConfig()
    
    // Create Directus client
    const directus = createDirectus(config.public.directusUrl)
      .with(authentication('json'))
      .with(rest())

    // Authenticate with Directus
    const authResult = await directus.login(validatedData.email, validatedData.password)
    
    if (!authResult || !authResult.access_token) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials'
      })
    }

    // Set the access token for subsequent requests
    directus.setToken(authResult.access_token)

    // Fetch user details with profile
    const user = await directus.request(
      readMe({
        fields: [
          'id',
          'email',
          'first_name',
          'last_name',
          'avatar',
          'role.id',
          'role.name',
          'role.admin_access',
          'role.app_access',
          'provider',
          'external_identifier'
        ] as any
      })
    ) as DirectusUser

    // Fetch user profile if it exists
    let profile: UserProfile | null = null
    try {
      const profiles = await directus.request(
        rest.readItems('profiles', {
          filter: {
            user_id: {
              _eq: user.id
            }
          },
          fields: ['*', 'organization_id.*'] as any,
          limit: 1
        })
      )
      profile = profiles?.[0] || null
    } catch (error) {
      console.log('No profile found for user, will create on first access')
    }

    // Create session user object
    const sessionUser: SessionUser = {
      id: user.id as string,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role as any,
      profile: profile,
      organization: profile?.organization_id as any
    }

    // Set session using nuxt-auth-utils
    await setUserSession(event, {
      user: sessionUser,
      tokens: {
        access_token: authResult.access_token,
        refresh_token: authResult.refresh_token,
        expires: authResult.expires,
        expires_at: authResult.expires_at
      }
    })

    // Return user data (without sensitive tokens)
    return {
      user: sessionUser,
      success: true
    }

  } catch (error: any) {
    console.error('Login error:', error)
    
    // Handle validation errors
    if (error.name === 'ZodError') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Validation error',
        data: error.errors
      })
    }

    // Handle Directus errors
    if (error.errors?.[0]?.extensions?.code === 'INVALID_CREDENTIALS') {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password'
      })
    }

    // Re-throw if it's already a proper error
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: 'An error occurred during login'
    })
  }
})
