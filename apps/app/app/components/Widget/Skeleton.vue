<script setup lang="ts">
/**
 * WidgetSkeleton — river-flow loading placeholder.
 * Renders one or more shimmering bars using the .river-skeleton material.
 *
 * <WidgetSkeleton :lines="3" />
 * <WidgetSkeleton class="h-32" />   <!-- single block, custom height via class -->
 */
withDefaults(
	defineProps<{
		/** Number of stacked bars. Omit for a single block sized by class. */
		lines?: number;
	}>(),
	{ lines: 1 },
);
</script>

<template>
	<div v-if="lines > 1" class="space-y-2">
		<div
			v-for="i in lines"
			:key="i"
			class="river-skeleton h-4"
			:class="i === lines ? 'w-2/3' : 'w-full'"
			:style="{ animationDelay: `${(i - 1) * 120}ms` }"
		/>
	</div>
	<div v-else class="river-skeleton h-4 w-full" />
</template>
