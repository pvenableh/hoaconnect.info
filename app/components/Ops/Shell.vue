<script setup lang="ts">
/**
 * The operator console frame: the staff-only gate, the page header and the
 * section switcher. The gate is a convenience: every /api/ops route checks the
 * caller's platform role on the server, so a page that slipped past this shows
 * nothing but a 403.
 */
const props = defineProps<{
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  /** "test" or "live", from the API, so nobody mistakes test data for revenue. */
  stripeMode?: string | null;
}>();

const route = useRoute();
const { isPlatformSupport } = useRoles();

const sections = [
  { value: "/ops", label: "Overview", icon: "lucide:gauge" },
  { value: "/ops/communities", label: "Communities", icon: "lucide:building-2" },
  { value: "/ops/billing-accounts", label: "Agencies", icon: "lucide:briefcase" },
  { value: "/ops/payments", label: "Payments", icon: "lucide:receipt" },
  { value: "/ops/health", label: "Health", icon: "lucide:heart-pulse" },
];
const current = computed(() => {
  const p = route.path.replace(/\/$/, "");
  return [...sections].reverse().find((s) => p === s.value || p.startsWith(`${s.value}/`))?.value ?? "/ops";
});
function go(path: string) {
  if (path !== route.path) void navigateTo(path);
}
</script>

<template>
  <RoleGate require-ops fallback>
    <div class="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 sm:pt-6">
      <AppPageHeader
        :title="props.title"
        eyebrow="HOA Connect operations"
        :description="props.description"
        :back-to="props.backTo"
        :back-label="props.backLabel"
      />
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <AppSegmentedControl :items="sections" :model-value="current" size="sm" label="Console sections" @update:model-value="go" />
        </div>
        <span
          v-if="props.stripeMode === 'test'"
          class="rounded-full bg-warning/15 px-2 py-0.5 type-micro font-medium text-warning"
          title="Stripe is in test mode: money figures are test data."
        >
          Stripe test mode
        </span>
        <span v-if="isPlatformSupport" class="rounded-full t-bg-subtle px-2 py-0.5 type-micro t-text-muted">
          Platform Support · read-only
        </span>
      </div>
      <div class="mt-5">
        <slot />
      </div>
    </div>
    <template #fallback>
      <div class="mx-auto max-w-md px-4 py-16">
        <AppEmptyState
          title="HOA Connect staff only"
          description="The operations console is for the people who run HOA Connect. Your community's billing is under Settings → Subscription."
          icon="lucide:shield"
        />
      </div>
    </template>
  </RoleGate>
</template>
