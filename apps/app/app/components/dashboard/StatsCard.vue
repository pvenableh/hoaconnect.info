<script setup lang="ts">
// iOS-style KPI card (Earnest design system). Drop-in upgrade — same prop API.
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
  <div class="ios-card p-5" :class="`accent-${accent}`">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-2xl font-semibold tabular-nums leading-tight t-text">{{ value }}</div>
        <p class="text-xs t-text-secondary mt-0.5 truncate">{{ title }}</p>
        <p v-if="description" class="text-[11px] t-text-muted truncate">
          {{ description }}
        </p>
      </div>
      <span
        v-if="icon"
        class="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
        :style="{
          backgroundColor: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l) / 0.12)',
          color: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l))',
        }"
      >
        <Icon :name="icon" class="w-5 h-5" />
      </span>
    </div>
    <div v-if="trend" class="flex items-center text-xs mt-3">
      <Icon
        :name="trend.positive ? 'heroicons:arrow-trending-up' : 'heroicons:arrow-trending-down'"
        :class="['h-3.5 w-3.5 mr-1', trend.positive ? 'text-emerald-600' : 'text-rose-600']"
      />
      <span :class="trend.positive ? 'text-emerald-600' : 'text-rose-600'">
        {{ trend.positive ? '+' : '' }}{{ trend.value }}%
      </span>
      <span class="t-text-muted ml-1">from last month</span>
    </div>
  </div>
</template>
