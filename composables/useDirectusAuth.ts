import { createDirectus, authentication, rest, readMe, type AuthenticationData } from '@directus/sdk'
import { toast } from 'vue-sonner'
import type { DirectusSchema, DirectusUser } from '~/types/directus-schema'

interface AuthState {
  user: DirectusUser | null
  loading: boolean
  error: string | null
}

export const useDirectusAuth = () => {
  const config = useRuntimeConfig()
  const router = useRouter()
  
  // State management
  const state = useState<AuthState>('auth', () => ({
    user: null,
    loading: false,
    error: null
  }))

  // Computed properties
  const user = computed(() => state.value.user)
  const isAuthenticated = computed(() => !!state.value.user)
  const loading = computed(() => state.value.loading)
  const error = computed(() => state.value.error)

  // Member property for multi-tenancy
  const member = computed(() => {
    if (!state.value.user) return null

    return {
      id: (state.value.user as any).member_id || null,
      organization: (state.value.user as any).organization || null,
      role: (state.value.user as any).role || null
    }
  })

  /**
   * Initialize the client with authentication
   */
  const getAuthClient = () => {
    return createDirectus<DirectusSchema>(config.public.directus.url)
      .with(authentication('session'))
      .with(rest())
  }

  /**
   * Login with email and password
   */
  const login = async (email: string, password: string) => {
    state.value.loading = true
    state.value.error = null

    try {
      // Login via server endpoint (handles Directus authentication and session)
      const result = await $fetch('/api/auth/login', {
        method: 'POST',
        body: {
          email,
          password
        }
      })

      if (!result?.user) {
        throw new Error('Invalid authentication response')
      }

      // Update state with user data
      state.value.user = result.user as any

      toast.success('Successfully logged in!')
      return result

    } catch (err: any) {
      state.value.error = err?.message || 'Login failed'
      toast.error(state.value.error)
      throw err
    } finally {
      state.value.loading = false
    }
  }

  /**
   * Register a new user
   */
  const register = async (data: {
    email: string
    password: string
    firstName: string
    lastName: string
    phone?: string
  }) => {
    state.value.loading = true
    state.value.error = null
    
    try {
      // Create user via API endpoint
      const result = await $fetch('/api/auth/register', {
        method: 'POST',
        body: data
      })
      
      // Auto-login after registration
      if (result.email && data.password) {
        await login(result.email, data.password)
      }
      
      toast.success('Account created successfully!')
      return result
      
    } catch (err: any) {
      state.value.error = err?.message || 'Registration failed'
      toast.error(state.value.error)
      throw err
    } finally {
      state.value.loading = false
    }
  }

  /**
   * Logout the current user
   */
  const logout = async () => {
    state.value.loading = true
    
    try {
      const client = getAuthClient()
      
      // Logout from Directus
      await client.logout()
      
      // Clear server-side session
      await $fetch('/api/auth/logout', {
        method: 'POST'
      })
      
      // Clear state
      state.value.user = null

      toast.success('Successfully logged out')

      // Redirect to login
      await navigateTo('/auth/login')

    } catch (err: any) {
      console.error('Logout error:', err)
      // Even if logout fails, clear local state
      state.value.user = null
      await navigateTo('/auth/login')
    } finally {
      state.value.loading = false
    }
  }

  /**
   * Fetch current user data
   */
  const fetchUser = async () => {
    try {
      const userData = await $fetch('/api/auth/me')

      if (userData) {
        state.value.user = userData.user
      }

      return userData
    } catch (err: any) {
      console.error('Failed to fetch user:', err)
      state.value.user = null
      return null
    }
  }

  /**
   * Refresh authentication tokens
   */
  const refreshTokens = async () => {
    try {
      const result = await $fetch('/api/auth/refresh', {
        method: 'POST'
      })
      
      return result
    } catch (err: any) {
      console.error('Failed to refresh tokens:', err)
      // If refresh fails, logout
      await logout()
      throw err
    }
  }

  /**
   * Request password reset
   */
  const requestPasswordReset = async (email: string) => {
    state.value.loading = true
    state.value.error = null
    
    try {
      const client = getAuthClient()
      
      await client.request({
        method: 'POST',
        path: '/auth/password/request',
        body: JSON.stringify({
          email,
          reset_url: `${config.public.appUrl}/auth/reset-password`
        })
      })
      
      toast.success('Password reset email sent!')
      return true
      
    } catch (err: any) {
      state.value.error = err?.message || 'Failed to send reset email'
      toast.error(state.value.error)
      throw err
    } finally {
      state.value.loading = false
    }
  }

  /**
   * Reset password with token
   */
  const resetPassword = async (token: string, password: string) => {
    state.value.loading = true
    state.value.error = null
    
    try {
      const client = getAuthClient()
      
      await client.request({
        method: 'POST',
        path: '/auth/password/reset',
        body: JSON.stringify({
          token,
          password
        })
      })
      
      toast.success('Password reset successfully!')
      return true
      
    } catch (err: any) {
      state.value.error = err?.message || 'Failed to reset password'
      toast.error(state.value.error)
      throw err
    } finally {
      state.value.loading = false
    }
  }

  /**
   * Initialize auth on app mount
   */
  const init = async () => {
    // Check if user has a session
    const { loggedIn } = useUserSession()
    
    if (loggedIn.value) {
      await fetchUser()
    }
  }

  // Auto-initialize
  onMounted(() => {
    init()
  })

  return {
    // State
    user: readonly(user),
    member: readonly(member),
    isAuthenticated: readonly(isAuthenticated),
    loading: readonly(loading),
    error: readonly(error),

    // Methods
    login,
    register,
    logout,
    fetchUser,
    refreshTokens,
    requestPasswordReset,
    resetPassword,
    init
  }
}
