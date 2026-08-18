<script setup lang="ts">
/**
 * WidgetGlass — iOS liquid-glass surface container.
 * Wraps the .glass-surface material from earnest-ui.css.
 *
 * <WidgetGlass accent="violet" hoverable>...</WidgetGlass>
 */
withDefaults(
	defineProps<{
		/** Accent preset that retints the glass + its descendants */
		accent?: 'cyan' | 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'gold';
		/** Lift + stronger shadow on hover (use for clickable cards) */
		hoverable?: boolean;
		/** Heavier blur + more opaque fill */
		strong?: boolean;
		/** Root element tag */
		as?: string;
	}>(),
	{ as: 'div' },
);
</script>

<template>
	<component
		:is="as"
		class="glass-surface p-5"
		:class="[
			accent ? `accent-${accent}` : '',
			{ 'glass-surface--hoverable': hoverable, 'glass-surface--strong': strong },
		]"
	>
		<slot />
	</component>
</template>
