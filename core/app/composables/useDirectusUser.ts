/**
 * useDirectusUser - User-specific operations composable
 * 
 * Handles current user operations, profile updates, user management,
 * invitations, and password resets using native Directus SDK methods
 * 
 * Usage:
 * const { me, updateProfile, inviteUser, acceptInvite, resetPassword } = useDirectusUser()
 */

export const useDirectusUser = () => {
  const { loggedIn } = useUserSession()
  
  /**
   * Get current user data
   */
  const me = async (fields: string[] = ['*', 'role.*']) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/users/me', {
      method: 'GET',
      query: { fields: fields.join(',') }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch user data')
    }
    
    return data.value
  }
  
  /**
   * Update current user's profile
   */
  const updateProfile = async (updates: Record<string, any>) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/users/me', {
      method: 'PATCH',
      body: updates
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to update profile')
    }
    
    return data.value
  }
  
  /**
   * Invite a new user
   */
  const inviteUser = async (email: string, role: string, additionalData?: Record<string, any>) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/users/invite', {
      method: 'POST',
      body: {
        email,
        role,
        ...additionalData
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to send invitation')
    }
    
    return data.value
  }
  
  /**
   * Accept an invitation and set password
   */
  const acceptInvite = async (token: string, password: string) => {
    const { data, error } = await useFetch('/api/directus/users/accept-invite', {
      method: 'POST',
      body: {
        token,
        password
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to accept invitation')
    }
    
    return data.value
  }
  
  /**
   * Request password reset
   */
  const requestPasswordReset = async (email: string) => {
    const { data, error } = await useFetch('/api/directus/users/password-reset-request', {
      method: 'POST',
      body: { email }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to request password reset')
    }
    
    return data.value
  }
  
  /**
   * Reset password with token
   */
  const resetPassword = async (token: string, password: string) => {
    const { data, error } = await useFetch('/api/directus/users/password-reset', {
      method: 'POST',
      body: {
        token,
        password
      }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to reset password')
    }
    
    return data.value
  }
  
  /**
   * Get user by ID (admin only)
   */
  const getUser = async (userId: string, fields: string[] = ['*', 'role.*']) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch(`/api/directus/users/${userId}`, {
      method: 'GET',
      query: { fields: fields.join(',') }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch user')
    }
    
    return data.value
  }
  
  /**
   * Update user by ID (admin only)
   */
  const updateUser = async (userId: string, updates: Record<string, any>) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch(`/api/directus/users/${userId}`, {
      method: 'PATCH',
      body: updates
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to update user')
    }
    
    return data.value
  }
  
  /**
   * Delete user by ID (admin only)
   */
  const deleteUser = async (userId: string) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { error } = await useFetch(`/api/directus/users/${userId}`, {
      method: 'DELETE'
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to delete user')
    }
    
    return true
  }
  
  /**
   * List users (admin only)
   */
  const listUsers = async (query?: {
    filter?: Record<string, any>
    fields?: string[]
    sort?: string[]
    limit?: number
  }) => {
    if (!loggedIn.value) {
      throw new Error('Authentication required')
    }
    
    const { data, error } = await useFetch('/api/directus/users', {
      method: 'POST',
      body: { query }
    })
    
    if (error.value) {
      throw new Error(error.value.message || 'Failed to fetch users')
    }
    
    return data.value
  }
  
  return {
    // Current user
    me,
    updateProfile,
    
    // Invitations
    inviteUser,
    acceptInvite,
    
    // Password management
    requestPasswordReset,
    resetPassword,
    
    // User management (admin)
    getUser,
    updateUser,
    deleteUser,
    listUsers
  }
}
