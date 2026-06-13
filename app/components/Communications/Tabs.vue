<!--
  CommunicationsTabs — the top-level Email · Channels · Audience strip that
  turns the communications area into one cohesive system. Channels used to be
  reachable only through the top-nav slide-over; this makes it a co-equal,
  first-class destination alongside Email and the Audience overview. The
  top-nav quick-peek chat button stays for power users.

  Self-gating: renders only on an org-scoped `/[slug]/admin/communications/*`
  route, so the shared EmailPage (also used in manager/global scope) doesn't
  show it where it doesn't belong.
-->
<script setup lang="ts">
const route = useRoute();
const { buildOrgPath } = useOrgNavigation();

const show = computed(
  () => !!route.params.slug && route.path.includes("/admin/communications"),
);

interface Tab {
  key: string;
  label: string;
  icon: string;
  to: string;
  isActive: (path: string) => boolean;
}

const tabs = computed<Tab[]>(() => [
  {
    key: "email",
    label: "Email",
    icon: "lucide:mail",
    to: buildOrgPath("/admin/communications"),
    // Email owns the inbox + its drill-downs (compose/activity/templates).
    isActive: (p) =>
      p.includes("/admin/communications") &&
      !p.includes("/communications/channels") &&
      !p.includes("/communications/audience"),
  },
  {
    key: "channels",
    label: "Channels",
    icon: "lucide:messages-square",
    to: buildOrgPath("/admin/communications/channels"),
    isActive: (p) => p.includes("/communications/channels"),
  },
  {
    key: "audience",
    label: "Audience",
    icon: "lucide:users",
    to: buildOrgPath("/admin/communications/audience"),
    isActive: (p) => p.includes("/communications/audience"),
  },
]);
</script>

<template>
  <nav v-if="show" class="comms-tabs" aria-label="Communications sections">
    <NuxtLink
      v-for="t in tabs"
      :key="t.key"
      :to="t.to"
      class="comms-tabs__item tappable"
      :class="{ 'comms-tabs__item--active': t.isActive(route.path) }"
      :aria-current="t.isActive(route.path) ? 'page' : undefined"
    >
      <Icon :name="t.icon" class="comms-tabs__icon" />
      <span>{{ t.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.comms-tabs {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  margin-bottom: 1.25rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--theme-bg-subtle, #f4f4f5) 80%, transparent);
  border: 1px solid var(--theme-border-primary, rgba(0, 0, 0, 0.08));
}
.comms-tabs__item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.95rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--theme-text-secondary, #6b7280);
  transition: background-color var(--motion-fast, 160ms) ease,
    color var(--motion-fast, 160ms) ease;
}
.comms-tabs__item:hover {
  color: var(--theme-text-primary, #1c1a16);
}
.comms-tabs__item--active {
  background: var(--theme-accent-primary, #111);
  color: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.comms-tabs__icon {
  width: 1rem;
  height: 1rem;
}
</style>
