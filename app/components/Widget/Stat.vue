<script setup lang="ts">
/**
 * @deprecated Use `<AppStatCard>`. This is a pass-through kept so the existing
 * call sites keep rendering while they migrate; it will be deleted once the
 * count reaches zero.
 */
withDefaults(
	defineProps<{
		label: string;
		value: string | number;
		icon?: string;
		accent?: 'cyan' | 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'gold';
		/** Signed percentage; positive renders as an increase. */
		trend?: number;
		loading?: boolean;
	}>(),
	{ icon: 'lucide:activity' },
);
</script>

<template>
	<AppStatCard
		:label="label"
		:value="value"
		:icon="icon"
		:accent="accent"
		:trend="trend"
		:loading="loading"
	/>
</template>
