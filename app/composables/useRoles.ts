/**
 * useRoles - Role-based access control composable
 *
 * Provides reactive role checks for the current user
 * Use this for conditional rendering and access control in components
 *
 * Usage:
 * const { currentRole, isAdmin, isHoaAdmin, hasRole, hasAnyRole } = useRoles()
 */

// Define app-specific roles
export const APP_ROLES = {
  APP_ADMIN: 'App Admin',
  HOA_ADMIN: 'HOA Admin',
  MEMBER: 'Member',
  // Legacy roles
  ADMINISTRATOR: 'Administrator',
  EDITOR: 'Editor',
  USER: 'User',
} as const

export type AppRole = typeof APP_ROLES[keyof typeof APP_ROLES]

export function useRoles() {
  const { user } = useUserSession()
  const config = useRuntimeConfig()

  // Get current user's role
  const currentRole = computed(() => {
    const role = user.value?.role
    // Handle role as object or string
    if (typeof role === 'object' && role !== null) {
      return (role as any).name || (role as any).id
    }
    return role
  })

  // Get current role ID
  const currentRoleId = computed(() => {
    const role = user.value?.role
    if (typeof role === 'object' && role !== null) {
      return (role as any).id
    }
    return role
  })

  // ============================================
  // Role Check Computed Properties
  // ============================================

  /**
   * Check if user is App Admin
   */
  const isAppAdmin = computed(() => {
    const roleId = currentRoleId.value
    return roleId === config.public.directusRoleAppAdmin ||
           currentRole.value === APP_ROLES.APP_ADMIN ||
           currentRole.value === APP_ROLES.ADMINISTRATOR
  })

  /**
   * Check if user is HOA Admin
   */
  const isHoaAdmin = computed(() => {
    const roleId = currentRoleId.value
    return isAppAdmin.value ||
           roleId === config.public.directusRoleHoaAdmin ||
           currentRole.value === APP_ROLES.HOA_ADMIN
  })

  /**
   * Check if user is Member
   */
  const isMember = computed(() => {
    const roleId = currentRoleId.value
    return roleId === config.public.directusRoleMember ||
           currentRole.value === APP_ROLES.MEMBER
  })

  /**
   * Check if user has any admin role
   */
  const isAdmin = computed(() => isAppAdmin.value || isHoaAdmin.value)

  /**
   * Check if user is an editor (can edit content)
   */
  const isEditor = computed(() => {
    return isAdmin.value ||
           currentRole.value === APP_ROLES.EDITOR
  })

  // ============================================
  // Role Check Functions
  // ============================================

  /**
   * Check if user has a specific role
   */
  function hasRole(role: string): boolean {
    return currentRole.value === role || currentRoleId.value === role
  }

  /**
   * Check if user has any of the specified roles
   */
  function hasAnyRole(roles: string[]): boolean {
    return roles.some(role => hasRole(role))
  }

  /**
   * Check if user has all of the specified roles
   */
  function hasAllRoles(roles: string[]): boolean {
    return roles.every(role => hasRole(role))
  }

  /**
   * Check if user has minimum role level
   * Order: Member < HOA Admin < App Admin
   */
  function hasMinimumRole(minimumRole: 'member' | 'hoa_admin' | 'app_admin'): boolean {
    switch (minimumRole) {
      case 'app_admin':
        return isAppAdmin.value
      case 'hoa_admin':
        return isHoaAdmin.value
      case 'member':
        return true // Any authenticated user
      default:
        return false
    }
  }

  /**
   * Check if user can access based on role ID
   */
  function canAccessWithRoleId(allowedRoleIds: string[]): boolean {
    const roleId = currentRoleId.value
    if (!roleId) return false
    return allowedRoleIds.includes(roleId) || isAppAdmin.value
  }

  // ============================================
  // Permission Helpers
  // ============================================

  /**
   * Check if user can manage users
   */
  const canManageUsers = computed(() => isHoaAdmin.value)

  /**
   * Check if user can manage organization settings
   */
  const canManageOrganization = computed(() => isHoaAdmin.value)

  /**
   * Check if user can view admin dashboard
   */
  const canViewAdminDashboard = computed(() => isAdmin.value)

  /**
   * Check if user can create content
   */
  const canCreateContent = computed(() => isEditor.value)

  /**
   * Check if user can edit content
   */
  const canEditContent = computed(() => isEditor.value)

  /**
   * Check if user can delete content
   */
  const canDeleteContent = computed(() => isAdmin.value)

  return {
    // State
    currentRole,
    currentRoleId,

    // Role checks (computed)
    isAppAdmin,
    isHoaAdmin,
    isMember,
    isAdmin,
    isEditor,

    // Role check functions
    hasRole,
    hasAnyRole,
    hasAllRoles,
    hasMinimumRole,
    canAccessWithRoleId,

    // Permission helpers (computed)
    canManageUsers,
    canManageOrganization,
    canViewAdminDashboard,
    canCreateContent,
    canEditContent,
    canDeleteContent,

    // Constants
    APP_ROLES
  }
}
