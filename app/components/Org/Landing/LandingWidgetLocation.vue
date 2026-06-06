<!-- Neighborhood / walk-score widget. Curated by the admin (settings.landing.places). -->
<template>
  <LandingWidgetShell
    v-if="show"
    :value="places.walk_score ?? undefined"
    :label="places.walk_score != null ? 'Walk Score' : 'Neighborhood'"
    icon="lucide:map-pin"
    :sub="places.neighborhood || undefined"
  >
    <div v-if="items.length" class="mt-1 flex flex-col gap-0.5">
      <div
        v-for="(p, i) in items"
        :key="i"
        class="flex items-center gap-2 text-[10px] tracking-wide"
      >
        <span class="truncate">{{ p.name }}</span>
        <span v-if="p.walk_time" class="ml-auto opacity-70 shrink-0">{{ p.walk_time }}</span>
      </div>
    </div>
  </LandingWidgetShell>
</template>

<script setup lang="ts">
import LandingWidgetShell from "./LandingWidgetShell.vue";
import type { LandingPlaces } from "~~/shared/utils/landing";

const props = defineProps<{ places: LandingPlaces; maxItems?: number }>();

const items = computed(() => (props.places.items || []).slice(0, props.maxItems ?? 4));
const show = computed(
  () =>
    props.places.walk_score != null ||
    !!props.places.neighborhood ||
    items.value.length > 0
);
</script>
