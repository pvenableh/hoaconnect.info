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
 *
 * Capability gating (shared/permissions.ts matrix, resolved per-org via
 * useCapabilities) — for board offices / team leads / PM grants that aren't
 * Directus roles:
 *
 * <RoleGate capability="money:read"> …treasurer-only widget… </RoleGate>
 * <RoleGate :any-capability="['projects:write','milestone:approve']"> … </RoleGate>
 *
 * Role and capability constraints AND together when both are supplied. While
 * capabilities are still loading the gate is closed (fail-closed).
 */
import type { Capability } from "~~/shared/permissions"

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
  /** Require this capability (shared matrix). */
  capability?: Capability
  /** Require ANY of these capabilities. */
  anyCapability?: Capability[]
  /** Show fallback slot when access denied */
  fallback?: boolean
}>()

const { isAppAdmin, isHoaAdmin, isAdmin, isMember, hasAnyRole } = useRoles()
const { can, ready, load } = useCapabilities()

const capSpecified = computed(
  () => !!props.capability || !!props.anyCapability?.length
)
onMounted(() => {
  if (capSpecified.value) load()
})

const roleOk = computed(() => {
  // No role constraint given → no role restriction.
  const roleSpecified =
    props.requireAppAdmin ||
    props.requireHoaAdmin ||
    props.requireAdmin ||
    props.requireMember ||
    !!props.roles?.length
  if (!roleSpecified) return true

  if (isAppAdmin.value) return true
  if (props.requireAppAdmin) return isAppAdmin.value
  if (props.requireHoaAdmin) return isHoaAdmin.value
  if (props.requireAdmin) return isAdmin.value
  if (props.requireMember) return isMember.value
  if (props.roles?.length) return hasAnyRole(props.roles) || isAppAdmin.value
  return true
})

const capOk = computed(() => {
  if (!capSpecified.value) return true
  if (!ready.value) return false // fail-closed while loading
  const required: Capability[] = []
  if (props.capability) required.push(props.capability)
  if (props.anyCapability?.length) required.push(...props.anyCapability)
  return required.some((c) => can(c))
})

const hasAccess = computed(() => roleOk.value && capOk.value)
</script>

<template>
  <slot v-if="hasAccess" />
  <slot v-else-if="fallback" name="fallback" />
</template>
