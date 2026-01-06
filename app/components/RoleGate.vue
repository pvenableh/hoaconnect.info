<script setup lang="ts">
/**
 * RoleGate - Conditional rendering based on user roles
 *
 * Usage:
 * <RoleGate :roles="['App Admin', 'HOA Admin']">
 *   <AdminPanel />
 * </RoleGate>
 *
 * <RoleGate require-admin>
 *   <AdminOnlyContent />
 * </RoleGate>
 *
 * <RoleGate require-hoa-admin fallback>
 *   <HoaContent />
 *   <template #fallback>
 *     <NoAccessMessage />
 *   </template>
 * </RoleGate>
 */

const props = defineProps<{
  /** Array of role names or IDs that can access */
  roles?: string[]
  /** Require app admin role */
  requireAppAdmin?: boolean
  /** Require HOA admin role (includes app admin) */
  requireHoaAdmin?: boolean
  /** Require any admin role */
  requireAdmin?: boolean
  /** Require member role */
  requireMember?: boolean
  /** Show fallback slot when access denied */
  fallback?: boolean
}>()

const { isAppAdmin, isHoaAdmin, isAdmin, isMember, hasAnyRole } = useRoles()

const hasAccess = computed(() => {
  // App admin always has access
  if (isAppAdmin.value) return true

  // Check specific role requirements
  if (props.requireAppAdmin) return isAppAdmin.value
  if (props.requireHoaAdmin) return isHoaAdmin.value
  if (props.requireAdmin) return isAdmin.value
  if (props.requireMember) return isMember.value

  // Check roles array
  if (props.roles?.length) {
    return hasAnyRole(props.roles) || isAppAdmin.value
  }

  // Default: allow access (no restrictions)
  return true
})
</script>

<template>
  <slot v-if="hasAccess" />
  <slot v-else-if="fallback" name="fallback" />
</template>
