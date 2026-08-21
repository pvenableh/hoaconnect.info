<script setup lang="ts">
/**
 * @deprecated Use `<AppStatCard>`. This is a pass-through kept so the existing
 * call sites keep rendering while they migrate; it will be deleted once the
 * count reaches zero.
 */
withDefaults(
  defineProps<{
    title: string
    value: number | string
    description?: string
    icon?: string
    accent?: 'cyan' | 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'gold'
    trend?: {
      value: number
      positive: boolean
    }
  }>(),
  { accent: 'cyan' },
)
</script>

<template>
  <AppStatCard
    :title="title"
    :value="value"
    :description="description"
    :icon="icon"
    :accent="accent"
    :trend="trend"
  />
</template>
