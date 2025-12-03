// composables/useDirectusRoles.ts
// Composable for managing Directus roles

import type { DirectusRole } from "~~/types/directus";

export function useDirectusRoles() {
  const config = useRuntimeConfig();

  /**
   * Get all available roles (excluding Administrator)
   */
  async function listRoles(): Promise<DirectusRole[]> {
    const response = await $fetch<{ data: DirectusRole[] }>("/api/roles/list");
    return response.data || [];
  }

  /**
   * Get a specific role by ID
   */
  async function getRole(id: string): Promise<DirectusRole | null> {
    const roles = await listRoles();
    return roles.find((role) => role.id === id) || null;
  }

  /**
   * Check if a role ID matches the admin role
   */
  function isAdminRole(roleId: string): boolean {
    return roleId === config.public.directusRoleAdmin;
  }

  /**
   * Check if a role ID matches the default user role
   */
  function isUserRole(roleId: string): boolean {
    return roleId === config.public.directusRoleUser;
  }

  /**
   * Get the admin role ID from config
   */
  function getAdminRoleId(): string | undefined {
    return config.public.directusRoleAdmin;
  }

  /**
   * Get the default user role ID from config
   */
  function getUserRoleId(): string | undefined {
    return config.public.directusRoleUser;
  }

  return {
    listRoles,
    getRole,
    isAdminRole,
    isUserRole,
    getAdminRoleId,
    getUserRoleId,
  };
}
