<script setup lang="ts">
// Settings hub — the single, discoverable home for everything "configure the
// org". Previously there was no settings/index.vue: admins could only reach
// Organization Settings via a Quick Action, and Public site / Vendors were lone
// buttons. This cards out every settings destination, grouped, glass-styled.
const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();
const { currentOrg } = await useSelectedOrg();

const isFreeAccount = computed(
  () => (currentOrg.value?.organization as any)?.is_free_account === true
);

interface HubItem {
  label: string;
  description: string;
  icon: string;
  to: string;
  show?: boolean;
}
interface HubGroup {
  label: string;
  description: string;
  items: HubItem[];
}

const groups = computed<HubGroup[]>(() =>
  [
    {
      label: "Organization",
      description: "Identity, branding, and how your community presents itself.",
      items: [
        { label: "General", description: "Name, contact details, and address.", icon: "lucide:building-2", to: buildOrgPath("/admin/settings/organization?tab=general") },
        { label: "Branding", description: "Logo, colors, and theme.", icon: "lucide:palette", to: buildOrgPath("/admin/settings/organization?tab=branding") },
        { label: "SEO", description: "Search and social preview metadata.", icon: "lucide:search", to: buildOrgPath("/admin/settings/organization?tab=seo") },
      ],
    },
    {
      label: "Public site",
      description: "Your community's outward-facing landing page and domain.",
      items: [
        { label: "Landing & domains", description: "Built-in landing vs external site, and custom/APEX domain.", icon: "lucide:globe", to: buildOrgPath("/admin/settings/domains") },
      ],
    },
    {
      label: "People & access",
      description: "Members, units, login accounts, and management staff.",
      items: [
        { label: "Members", description: "Owners, tenants, and their units.", icon: "lucide:users-round", to: buildOrgPath("/admin/members"), show: isEnabled("directory") },
        { label: "Units", description: "Units, addresses, and occupancy.", icon: "lucide:door-closed", to: buildOrgPath("/admin/units"), show: isEnabled("directory") },
        { label: "Users", description: "Login accounts and roles.", icon: "lucide:user-cog", to: buildOrgPath("/admin/users") },
        { label: "Teams", description: "Committees and working groups.", icon: "lucide:users", to: buildOrgPath("/admin/teams") },
        { label: "Vendors & management", description: "Service providers and property-manager access.", icon: "lucide:contact", to: buildOrgPath("/admin/settings/property-management"), show: isEnabled("vendors") },
      ],
    },
    {
      label: "Features",
      description: "Turn optional modules on or off for this community.",
      items: [
        { label: "Modules", description: "Enable or disable apps like Polls, Files, Channels.", icon: "lucide:toggle-right", to: buildOrgPath("/admin/settings/organization?tab=modules") },
      ],
    },
    {
      label: "Billing & payments",
      description: "Subscription, dues, and payout configuration.",
      items: [
        { label: "Payment settings", description: "Dues, late fees, and Stripe payouts.", icon: "lucide:credit-card", to: buildOrgPath("/admin/settings/organization?tab=payments") },
        { label: "Subscription", description: "Your HOA Connect plan and invoices.", icon: "lucide:sparkles", to: buildOrgPath("/admin/settings/organization?tab=subscription"), show: !isFreeAccount.value },
      ],
    },
  ].map((g) => ({ ...g, items: g.items.filter((i) => i.show !== false) }))
);
</script>

<template>
  <div class="ui-kit accent-cyan min-h-screen t-bg">
    <PageContainer class="space-y-8">
      <!-- Glass hero header -->
      <WidgetGlass strong>
        <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1.5">Admin</p>
        <h1 class="text-3xl font-semibold tracking-tight t-text">Settings</h1>
        <p class="t-text-secondary mt-1">
          Everything to configure your community — organization, public site, people, features, and billing.
        </p>
      </WidgetGlass>

      <section v-for="group in groups" :key="group.label" class="space-y-3">
        <div>
          <h2 class="text-sm font-semibold uppercase tracking-wider t-text-secondary">
            {{ group.label }}
          </h2>
          <p class="text-sm t-text-muted">{{ group.description }}</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="item in group.items"
            :key="item.label"
            :to="item.to"
            class="ios-card p-5 flex items-start gap-4 hover:shadow-lg transition-shadow group"
          >
            <span
              class="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
              :style="{
                backgroundColor: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l) / 0.12)',
                color: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l))',
              }"
            >
              <Icon :name="item.icon" class="w-5 h-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold t-text">{{ item.label }}</h3>
              <p class="text-sm t-text-muted">{{ item.description }}</p>
            </div>
            <Icon
              name="lucide:chevron-right"
              class="w-5 h-5 t-text-muted shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform"
            />
          </NuxtLink>
        </div>
      </section>
    </PageContainer>
  </div>
</template>
