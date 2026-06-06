<!-- Community size widget — household / member count from the org record. -->
<template>
  <LandingWidgetShell
    v-if="count > 0"
    :value="count"
    :label="count === 1 ? 'Household' : 'Households'"
    icon="lucide:building-2"
    sub="In the community"
  />
</template>

<script setup lang="ts">
import LandingWidgetShell from "./LandingWidgetShell.vue";

const props = defineProps<{ count?: number | null }>();
const count = computed(() => Number(props.count) || 0);
</script>
