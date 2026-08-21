<script setup lang="ts">
/**
 * A single number worth looking at.
 *
 * Unifies WidgetStat and DashboardStatsCard, which rendered the same card from
 * incompatible props (`label` vs `title`, a signed `trend` number vs a
 * `{value, positive}` object). Both spellings are accepted here so call sites
 * can move over without being rewritten, and both old components are now thin
 * wrappers around this one.
 *
 * Trend direction and trend GOODNESS are separate on purpose: outstanding dues
 * going up is an increase and bad news. `trendPositive` overrides the default
 * assumption that up is good.
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
    /** Signed percentage change, or the legacy `{ value, positive }` object. */
    trend?: number | { value: number; positive: boolean };
    /** Is an increase good news? Defaults to yes. */
    trendPositive?: boolean;
    loading?: boolean;
  }>(),
  { icon: "lucide:activity" },
);

const heading = computed(() => props.label ?? props.title ?? "");

const trendValue = computed(() => {
  if (props.trend == null) return null;
  return typeof props.trend === "number" ? props.trend : props.trend.value;
});

/** Which way the number moved. */
const trendUp = computed(() => (trendValue.value ?? 0) >= 0);

/** Whether that movement is good — which is not the same question. */
const trendIsGood = computed(() => {
  if (typeof props.trend === "object" && props.trend) return props.trend.positive;
  if (props.trendPositive === false) return !trendUp.value;
  return trendUp.value;
});

const showTrend = computed(() => trendValue.value != null && trendValue.value !== 0);
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
      {{ Math.abs(trendValue as number) }}%
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
