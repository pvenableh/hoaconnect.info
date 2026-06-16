<script setup lang="ts">
/**
 * WidgetStat — iOS KPI widget card.
 * Icon disc + big tabular value + label, optional trend chip.
 *
 * <WidgetStat label="Outstanding dues" value="$4,200" icon="lucide:dollar-sign"
 *             accent="amber" :trend="-12" />
 */
const props = withDefaults(
	defineProps<{
		label: string;
		value: string | number;
		icon?: string;
		accent?: 'cyan' | 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'gold';
		/** Signed percentage; positive renders emerald-up, negative rose-down */
		trend?: number;
		loading?: boolean;
	}>(),
	{ icon: 'lucide:activity' },
);

const trendUp = computed(() => (props.trend ?? 0) >= 0);
</script>

<template>
	<div class="ios-card p-5" :class="accent ? `accent-${accent}` : ''">
		<div class="flex items-center gap-3">
			<span
				class="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
				:style="{
					backgroundColor: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l) / 0.12)',
					color: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l))',
				}"
			>
				<Icon :name="icon" class="w-5 h-5" />
			</span>
			<div class="min-w-0">
				<div v-if="loading" class="river-skeleton h-7 w-24" />
				<p v-else class="text-2xl font-semibold tabular-nums leading-tight t-text truncate">
					{{ value }}
				</p>
				<p class="text-xs t-text-secondary truncate">{{ label }}</p>
			</div>
			<span
				v-if="trend !== undefined && !loading"
				class="ml-auto text-xs font-medium tabular-nums px-2 py-0.5 rounded-full shrink-0"
				:class="trendUp ? 'text-emerald-600 bg-emerald-500/10' : 'text-rose-600 bg-rose-500/10'"
			>
				{{ trendUp ? '↑' : '↓' }} {{ Math.abs(trend) }}%
			</span>
		</div>
	</div>
</template>
