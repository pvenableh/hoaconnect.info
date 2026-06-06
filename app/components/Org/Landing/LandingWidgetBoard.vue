<!-- Board size widget — counts current board members via the public endpoint. -->
<template>
  <LandingWidgetShell
    v-if="count > 0"
    :value="count"
    :label="count === 1 ? 'Board Member' : 'Board Members'"
    icon="lucide:users"
    sub="Serving the community"
  />
</template>

<script setup lang="ts">
import LandingWidgetShell from "./LandingWidgetShell.vue";

const props = defineProps<{ slug: string }>();

const { data } = useFetch<{ boardMembers?: any[] }>("/api/hoa/board-members", {
  query: { slug: props.slug },
  lazy: true,
  default: () => ({ boardMembers: [] }),
});
const count = computed(() => data.value?.boardMembers?.length || 0);
</script>
