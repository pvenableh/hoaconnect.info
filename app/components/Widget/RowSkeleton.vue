<!--
  WidgetRowSkeleton — content-shaped list loader.

  A row of: optional leading avatar (circle/square) + 1–2 text lines + optional
  trailing meta block, repeated `rows` times with a flowing shimmer cascade.
  Built on the same `.river-skeleton` material as Widget/Skeleton.vue (which
  already no-ops under prefers-reduced-motion), so loading reads as the shape of
  the content to come instead of a generic spinner.

    <WidgetRowSkeleton :rows="6" />                 list rows w/ avatar + meta
    <WidgetRowSkeleton :rows="4" :avatar="false" /> plain text rows
-->
<script setup lang="ts">
withDefaults(
	defineProps<{
		/** Number of placeholder rows. */
		rows?: number;
		/** Show the leading avatar/icon block. */
		avatar?: boolean;
		/** Avatar geometry — circle (people) or rounded square (docs/icons). */
		avatarShape?: "circle" | "square";
		/** Text lines per row (1 or 2). */
		lines?: number;
		/** Show the trailing meta block (status pill / amount / date). */
		trailing?: boolean;
	}>(),
	{ rows: 5, avatar: true, avatarShape: "circle", lines: 2, trailing: true },
);
</script>

<template>
	<div class="space-y-1" role="status" aria-label="Loading…" aria-live="polite">
		<div
			v-for="i in rows"
			:key="i"
			class="flex items-center gap-3 px-3 py-3"
		>
			<div
				v-if="avatar"
				class="river-skeleton h-9 w-9 flex-shrink-0"
				:class="avatarShape === 'circle' ? 'rounded-full' : 'rounded-lg'"
				:style="{ animationDelay: `${(i - 1) * 90}ms` }"
			/>
			<div class="min-w-0 flex-1 space-y-2">
				<div
					class="river-skeleton h-3.5 w-1/2"
					:style="{ animationDelay: `${(i - 1) * 90}ms` }"
				/>
				<div
					v-if="lines > 1"
					class="river-skeleton h-3 w-3/4"
					:style="{ animationDelay: `${(i - 1) * 90 + 40}ms` }"
				/>
			</div>
			<div
				v-if="trailing"
				class="river-skeleton h-5 w-16 flex-shrink-0 rounded-full"
				:style="{ animationDelay: `${(i - 1) * 90 + 60}ms` }"
			/>
		</div>
	</div>
</template>
