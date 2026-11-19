<script setup lang="ts">
// One back-link style across the app. Matches the header breadcrumb chrome:
// small, uppercase, wide tracking, muted, with a leading chevron. Pass an
// org-aware `to` (use useOrgNavigation().buildOrgPath()).
interface Props {
  to: string;
  label: string;
}

defineProps<Props>();
</script>

<template>
  <!-- allow-type-px: 11px tracked caps; type-micro is 10px/600, a visible change -->
  <NuxtLink
    class="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest t-text-muted hover:t-text transition-colors"
    :to="to"
  >
    <Icon name="lucide:chevron-left" class="w-3.5 h-3.5" />
    {{ label }}
  </NuxtLink>
</template>
