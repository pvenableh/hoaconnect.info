import { createDirectus, authentication, rest, readMe, type AuthenticationData } from '@directus/sdk'
import { toast } from 'vue-sonner'
import type { DirectusSchema, DirectusUser, UserProfile } from '~/types/directus-schema'

interface AuthState {
  user: DirectusUser | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
}

export const useDirectusAuth = () => {
  const config = useRuntimeConfig()
  const router = useRouter()
  
  // State management
  const state = useState<AuthState>('auth', () => ({
    user: null,
    profile: null,
    loading: false,
    error: null
  }))

  // Computed properties
  const user = computed(() => state.value.user)
  const profile = computed(() => state.value.profile)
  const isAuthenticated = computed(() => !!state.value.user)
  const loading = computed(() => state.value.loading)
  const error = computed(() => state.value.error)

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
      const client = getAuthClient()
      
      // Authenticate with Directus
      const result = await client.login(email, password)
      
      if (!result.access_token || !result.refresh_token) {
        throw new Error('Invalid authentication response')
      }

      // Store tokens server-side using nuxt-auth-utils
      await $fetch('/api/auth/login', {
        method: 'POST',
        body: {
          directusAccessToken: result.access_token,
          directusRefreshToken: result.refresh_token,
          expires: result.expires
        }
      })
      
      // Fetch user data
      await fetchUser()
      
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
    first_name: string
    last_name: string
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
      state.value.profile = null
      
      toast.success('Successfully logged out')
      
      // Redirect to login
      await navigateTo('/auth/login')
      
    } catch (err: any) {
      console.error('Logout error:', err)
      // Even if logout fails, clear local state
      state.value.user = null
      state.value.profile = null
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
        state.value.profile = userData.profile
      }
      
      return userData
    } catch (err: any) {
      console.error('Failed to fetch user:', err)
      state.value.user = null
      state.value.profile = null
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
    profile: readonly(profile),
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
