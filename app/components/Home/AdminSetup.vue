<script setup lang="ts">
/**
 * HomeAdminSetup — the admin's "Setup health" Needs-you item
 * (docs/plan-unified-experience.md §5). Shows only what is wrong with billing,
 * the custom domain and payouts, each one click from its fix. Renders nothing
 * while loading, when the org cannot be read, or when everything is fine.
 */
import { entitlementFields } from "#core/shared/utils/entitlement";
import { setupIssues } from "#core/shared/home/setup-health";

const { selectedOrgId } = await useSelectedOrg();
const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();
const orgItems = useDirectusItems("hoa_organizations");

const { data: org } = useAsyncData(
  () => `home-setup-health-${selectedOrgId.value}`,
  async () =>
    selectedOrgId.value
      ? ((await orgItems.get(selectedOrgId.value, {
          fields: ["id", "custom_domain", "domain_verified", "external_url", "connect_onboarding_status", "connect_payouts_enabled", ...entitlementFields()],
        })) as any)
      : null,
  { watch: [selectedOrgId], server: false, default: () => null },
);

const issues = computed(() => setupIssues(org.value, { paymentsOn: isEnabled("payments") }));
</script>

<template>
  <AppCard v-if="issues.length" class="overflow-hidden py-0" data-testid="home-setup-health">
    <div class="px-4 pt-3">
      <h2 class="t-eyebrow">Setup health</h2>
    </div>
    <ul class="divide-y">
      <li v-for="i in issues" :key="i.key">
        <NuxtLink :to="buildOrgPath(i.path)" class="flex items-center gap-3 px-4 py-3 hover:bg-muted/50" data-testid="home-setup-issue">
          <Icon
            :name="i.tone === 'bad' ? 'i-lucide-circle-alert' : 'i-lucide-triangle-alert'"
            class="h-4 w-4 shrink-0"
            :class="i.tone === 'bad' ? 'text-destructive' : 't-text-muted'"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium t-text">{{ i.label }}</span>
            <span class="block truncate text-sm t-text-muted">{{ i.detail }}</span>
          </span>
          <span class="shrink-0 text-xs font-medium t-text-muted">Fix</span>
          <Icon name="i-lucide-chevron-right" class="h-4 w-4 shrink-0 t-text-muted" />
        </NuxtLink>
      </li>
    </ul>
  </AppCard>
</template>
