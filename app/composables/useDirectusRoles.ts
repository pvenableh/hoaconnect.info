/**
 * useDirectusRoles - Role management composable
 *
 * Handles role queries and management using Directus SDK methods
 * Provides both CRUD operations and helper functions for role checks
 *
 * Usage:
 * const { list, get, getByName, create, update, remove, isAdminRole } = useDirectusRoles()
 */

import type { DirectusRole } from "~~/types/directus"

interface ItemsQuery {
  filter?: Record<string, any>
  fields?: string[]
  sort?: string[]
  limit?: number
}

export function useDirectusRoles() {
  const config = useRuntimeConfig()
  const items = useDirectusItems<DirectusRole>('directus_roles')

  // ============================================
  // CRUD Operations
  // ============================================

  /**
   * List all roles with optional filtering
   */
  async function list(query?: ItemsQuery): Promise<DirectusRole[]> {
    return await items.list(query)
  }

  /**
   * Get all available roles (excluding Administrator)
   * @deprecated Use list() instead for more flexibility
   */
  async function listRoles(): Promise<DirectusRole[]> {
    try {
      const response = await $fetch<{ data: DirectusRole[] }>("/api/roles/list")
      return response.data || []
    } catch {
      // Fallback to items API if dedicated endpoint doesn't exist
      return await list({
        filter: { name: { _neq: 'Administrator' } }
      })
    }
  }

  /**
   * Get single role by ID
   */
  async function get(id: string, query?: ItemsQuery): Promise<DirectusRole> {
    return await items.get(id, query)
  }

  /**
   * Get a specific role by ID
   * @deprecated Use get() instead
   */
  async function getRole(id: string): Promise<DirectusRole | null> {
    try {
      return await get(id)
    } catch {
      return null
    }
  }

  /**
   * Get role by name
   */
  async function getByName(name: string): Promise<DirectusRole | null> {
    const roles = await items.list({
      filter: { name: { _eq: name } },
      limit: 1
    })
    return roles[0] || null
  }

  /**
   * Create a new role (admin only)
   */
  async function create(data: Partial<DirectusRole>): Promise<DirectusRole> {
    return await items.create(data)
  }

  /**
   * Update a role (admin only)
   */
  async function update(id: string, data: Partial<DirectusRole>): Promise<DirectusRole> {
    return await items.update(id, data)
  }

  /**
   * Delete a role (admin only)
   */
  async function remove(id: string): Promise<boolean> {
    await items.remove(id)
    return true
  }

  // ============================================
  // Query Helpers
  // ============================================

  /**
   * Get admin roles (with admin_access = true)
   */
  async function getAdminRoles(): Promise<DirectusRole[]> {
    return await items.list({
      filter: { admin_access: { _eq: true } }
    })
  }

  /**
   * Get public roles (non-admin with app access)
   */
  async function getPublicRoles(): Promise<DirectusRole[]> {
    return await items.list({
      filter: {
        admin_access: { _eq: false },
        app_access: { _eq: true }
      }
    })
  }

  /**
   * Get users for a specific role
   */
  async function getRoleUsers(roleId: string): Promise<any[]> {
    const role = await get(roleId, {
      fields: ['users.*']
    })
    return (role as any)?.users || []
  }

  // ============================================
  // Role Check Helpers (from original)
  // ============================================

  /**
   * Check if a role ID matches the app admin role
   */
  function isAppAdminRole(roleId: string): boolean {
    return roleId === config.public.directusRoleAppAdmin
  }

  /**
   * Check if a role ID matches the HOA admin role
   */
  function isHoaAdminRole(roleId: string): boolean {
    return roleId === config.public.directusRoleHoaAdmin
  }

  /**
   * Check if a role ID matches the member role
   */
  function isMemberRole(roleId: string): boolean {
    return roleId === config.public.directusRoleMember
  }

  /**
   * Check if a role ID matches the admin role (legacy)
   */
  function isAdminRole(roleId: string): boolean {
    return roleId === config.public.directusRoleAdmin ||
           roleId === config.public.directusRoleAppAdmin
  }

  /**
   * Check if a role ID matches the default user role (legacy)
   */
  function isUserRole(roleId: string): boolean {
    return roleId === config.public.directusRoleUser ||
           roleId === config.public.directusRoleMember
  }

  // ============================================
  // Config Getters
  // ============================================

  /**
   * Get the app admin role ID from config
   */
  function getAppAdminRoleId(): string | undefined {
    return config.public.directusRoleAppAdmin
  }

  /**
   * Get the HOA admin role ID from config
   */
  function getHoaAdminRoleId(): string | undefined {
    return config.public.directusRoleHoaAdmin
  }

  /**
   * Get the member role ID from config
   */
  function getMemberRoleId(): string | undefined {
    return config.public.directusRoleMember
  }

  /**
   * Get the admin role ID from config (legacy)
   */
  function getAdminRoleId(): string | undefined {
    return config.public.directusRoleAdmin || config.public.directusRoleAppAdmin
  }

  /**
   * Get the default user role ID from config (legacy)
   */
  function getUserRoleId(): string | undefined {
    return config.public.directusRoleUser || config.public.directusRoleMember
  }

  return {
    // CRUD operations
    list,
    get,
    getByName,
    create,
    update,
    remove,
    delete: remove, // Alias

    // Query helpers
    getAdminRoles,
    getPublicRoles,
    getRoleUsers,

    // Role check helpers
    isAppAdminRole,
    isHoaAdminRole,
    isMemberRole,
    isAdminRole,
    isUserRole,

    // Config getters
    getAppAdminRoleId,
    getHoaAdminRoleId,
    getMemberRoleId,
    getAdminRoleId,
    getUserRoleId,

    // Legacy aliases
    listRoles,
    getRole
  }
}
