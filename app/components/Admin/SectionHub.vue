<script setup lang="ts">
// Shared cards-index landing for an admin section ("hub"). Each consolidated
// dock icon (People, Reporting, Settings, …) opens one of these: a glass hero
// plus grouped cards that drill into the section's individual features. Keeps
// every hub visually identical and lets the dock stay lean.
export interface HubItem {
  label: string;
  description: string;
  icon: string; // lucide name, with or without the i-lucide- prefix
  to: string;
  show?: boolean;
}
export interface HubGroup {
  label?: string;
  description?: string;
  items: HubItem[];
}

const props = defineProps<{
  eyebrow?: string;
  title: string;
  subtitle?: string;
  groups: HubGroup[];
}>();

const { buildOrgPath } = useOrgNavigation();

const iconName = (icon: string) =>
  icon.includes(":") || icon.startsWith("i-") ? icon : `lucide:${icon}`;

// Drop hidden items, then drop any group left empty.
const visibleGroups = computed(() =>
  props.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show !== false) }))
    .filter((g) => g.items.length > 0)
);
</script>

<template>
  <div class="ui-kit min-h-screen t-bg">
    <PageContainer class="space-y-8">
      <WidgetGlass strong>
        <p v-if="eyebrow" class="text-xs uppercase tracking-widest t-text-tertiary mb-1.5">{{ eyebrow }}</p>
        <h1 class="text-3xl font-semibold tracking-tight t-text">{{ title }}</h1>
        <p v-if="subtitle" class="t-text-secondary mt-1">{{ subtitle }}</p>
      </WidgetGlass>

      <!-- Empty state — every card in this hub is gated off for this community. -->
      <div v-if="!visibleGroups.length" class="ios-card p-12 text-center">
        <Icon name="lucide:layout-grid" class="mx-auto h-10 w-10 t-text-muted mb-3 opacity-60" />
        <h3 class="text-lg font-medium t-text mb-1">Nothing here yet</h3>
        <p class="t-text-muted">
          The features for this section aren't enabled. Turn them on in
          <NuxtLink :to="buildOrgPath('/admin/settings/organization?tab=modules')" class="t-text-accent underline">Settings → Features</NuxtLink>.
        </p>
      </div>

      <section v-for="(group, gi) in visibleGroups" :key="gi" class="space-y-3">
        <div v-if="group.label || group.description">
          <h2 v-if="group.label" class="text-sm font-semibold uppercase tracking-wider t-text-secondary">
            {{ group.label }}
          </h2>
          <p v-if="group.description" class="text-sm t-text-muted">{{ group.description }}</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="(item, ii) in group.items"
            :key="item.label"
            v-motion
            :initial="{ opacity: 0, y: 14 }"
            :enter="{
              opacity: 1,
              y: 0,
              transition: { type: 'spring', stiffness: 220, damping: 28, delay: gi * 80 + ii * 40 },
            }"
            :to="item.to"
            class="ios-card p-5 flex items-start gap-4 hover:shadow-lg transition-shadow group"
          >
            <span
              class="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
              :style="{
                backgroundColor: 'color-mix(in srgb, var(--theme-accent-primary) 12%, transparent)',
                color: 'var(--theme-accent-primary)',
              }"
            >
              <Icon :name="iconName(item.icon)" class="w-5 h-5" />
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
