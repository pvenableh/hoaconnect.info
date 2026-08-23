<script setup lang="ts">
/**
 * A single number worth looking at. The one stat card in the app.
 *
 * `label` and `title` are the same thing spelled two ways — the two components
 * this replaced disagreed, and both spellings are still in call sites.
 *
 * Trend direction and trend GOODNESS are separate on purpose: outstanding dues
 * going up is an increase and bad news. `trendPositive` overrides the default
 * assumption that up is good.
 *
 * `accent` exists but the workspace has one accent, so leaving it unset is the
 * norm; it is here for the day an org tints its own admin.
 */
const props = withDefaults(
  defineProps<{
    /** The metric name. `title` is the older spelling of the same thing. */
    label?: string;
    title?: string;
    value: string | number;
    /** Secondary line under the label. */
    description?: string;
    icon?: string;
    accent?: "cyan" | "blue" | "violet" | "emerald" | "amber" | "rose" | "gold";
    /** Signed percentage change. */
    trend?: number;
    /** Is an increase good news? Defaults to yes. */
    trendPositive?: boolean;
    loading?: boolean;
  }>(),
  { icon: "lucide:activity" },
);

const heading = computed(() => props.label ?? props.title ?? "");

/** Which way the number moved. */
const trendUp = computed(() => (props.trend ?? 0) >= 0);

/** Whether that movement is good — which is not the same question. */
const trendIsGood = computed(() =>
  props.trendPositive === false ? !trendUp.value : trendUp.value,
);

const showTrend = computed(() => props.trend != null && props.trend !== 0);
</script>

<template>
  <div class="ios-card p-5" :class="accent ? `accent-${accent}` : ''">
    <div class="flex items-center gap-3">
      <span v-if="icon" class="stat-card__icon" aria-hidden="true">
        <Icon :name="icon" class="w-5 h-5" />
      </span>

      <div class="min-w-0 flex-1">
        <div v-if="loading" class="river-skeleton h-7 w-24" />
        <p v-else class="stat-card__value">{{ value }}</p>

        <p class="type-meta truncate">{{ heading }}</p>
        <p v-if="description" class="type-micro stat-card__description truncate">
          {{ description }}
        </p>
      </div>
    </div>

    <p
      v-if="showTrend && !loading"
      class="stat-card__trend"
      :class="trendIsGood ? 'stat-card__trend--good' : 'stat-card__trend--bad'"
    >
      <Icon
        :name="trendUp ? 'lucide:trending-up' : 'lucide:trending-down'"
        class="size-3.5"
      />
      {{ Math.abs(trend as number) }}%
      <span class="stat-card__trend-note">from last month</span>
    </p>
  </div>
</template>

<style scoped>
.stat-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  flex-shrink: 0;
  background: hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l) / 0.12);
  color: hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l));
}
.stat-card__value {
  font-size: 1.5rem;
  font-weight: 650;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--theme-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stat-card__description {
  color: var(--theme-text-muted);
}
.stat-card__trend {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.75rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}
/* Status colour comes from the theme, not a raw palette class, so it follows
   light/dark like everything else. */
.stat-card__trend--good {
  color: var(--success);
}
.stat-card__trend--bad {
  color: var(--destructive);
}
.stat-card__trend-note {
  color: var(--theme-text-muted);
}
</style>
