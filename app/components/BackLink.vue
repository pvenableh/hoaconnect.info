<script setup lang="ts">
// One back-link style across the app. Matches the header breadcrumb chrome:
// the `type-micro` caps, muted, with a leading chevron. Pass an
// org-aware `to` (use useOrgNavigation().buildOrgPath()).
interface Props {
  to: string;
  label: string;
}

defineProps<Props>();
</script>

<template>
  <NuxtLink
    class="type-micro inline-flex items-center gap-1 t-text-muted hover:t-text transition-colors"
    :to="to"
  >
    <Icon name="lucide:chevron-left" class="w-3.5 h-3.5" />
    {{ label }}
  </NuxtLink>
</template>
