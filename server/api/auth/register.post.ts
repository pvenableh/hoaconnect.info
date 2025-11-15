// server/api/auth/register.post.ts
import { createDirectus, rest, authentication, createUser, createItem, readRole } from '@directus/sdk'
import { registerSchema } from '~/schemas/auth'
import type { DirectusUser, SessionUser, DirectusRole } from '~/types/directus-schema'

export default defineEventHandler(async (event) => {
  try {
    // Validate request body
    const body = await readBody(event)
    const validatedData = registerSchema.parse(body)

    // Get runtime config
    const config = useRuntimeConfig()
    
    // Create admin Directus client with static token
    const adminDirectus = createDirectus(config.public.directusUrl)
      .with(rest())
      .with(authentication('json'))
    
    // Use static token for admin operations
    adminDirectus.setToken(config.directusServerToken)

    // Get the default user role
    let userRole: DirectusRole | null = null
    try {
      const roles = await adminDirectus.request<DirectusRole[]>(
        rest.readItems('directus_roles', {
          filter: {
            name: {
              _eq: 'User'
            }
          },
          limit: 1
        })
      )
      userRole = roles[0] || null
    } catch (error) {
      console.error('Failed to fetch user role:', error)
    }

    if (!userRole) {
      throw createError({
        statusCode: 500,
        statusMessage: 'User role not configured'
      })
    }

    // Check if user already exists
    const existingUsers = await adminDirectus.request(
      rest.readItems('directus_users', {
        filter: {
          email: {
            _eq: validatedData.email
          }
        },
        limit: 1
      })
    )

    if (existingUsers && existingUsers.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'An account with this email already exists'
      })
    }

    // Create the user in Directus
    const newUser = await adminDirectus.request(
      createUser({
        email: validatedData.email,
        password: validatedData.password,
        first_name: validatedData.firstName,
        last_name: validatedData.lastName,
        role: userRole.id as string,
        status: 'active'
      })
    ) as DirectusUser

    // Auto-login the user after registration
    const userDirectus = createDirectus(config.public.directusUrl)
      .with(authentication('json'))
      .with(rest())

    const authResult = await userDirectus.login({
      email: validatedData.email,
      password: validatedData.password
    })

    // Create session user object
    const sessionUser: SessionUser = {
      id: newUser.id as string,
      email: newUser.email,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      role: userRole,
      organization: null,
      member: null
    }

    // Set session
    await setUserSession(event, {
      user: sessionUser,
      tokens: {
        access_token: authResult.access_token,
        refresh_token: authResult.refresh_token,
        expires: authResult.expires,
        expires_at: authResult.expires_at
      }
    })

    return {
      user: sessionUser,
      success: true
    }

  } catch (error: any) {
    console.error('Registration error:', error)
    
    // Handle validation errors
    if (error.name === 'ZodError') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Validation error',
        data: error.errors
      })
    }

    // Handle duplicate email error
    if (error.errors?.[0]?.extensions?.code === 'RECORD_NOT_UNIQUE') {
      throw createError({
        statusCode: 409,
        statusMessage: 'An account with this email already exists'
      })
    }

    // Re-throw if it's already a proper error
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: 'An error occurred during registration'
    })
  }
})
