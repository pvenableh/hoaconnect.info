<!-- Amenities count widget — from the org's amenities relation. -->
<template>
  <LandingWidgetShell
    v-if="count > 0"
    :value="count"
    :label="count === 1 ? 'Amenity' : 'Amenities'"
    icon="lucide:gem"
    sub="On offer"
  />
</template>

<script setup lang="ts">
import LandingWidgetShell from "./LandingWidgetShell.vue";

const props = defineProps<{ count?: number | null }>();
const count = computed(() => Number(props.count) || 0);
</script>
