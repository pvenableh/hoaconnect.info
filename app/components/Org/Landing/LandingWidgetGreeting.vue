<!-- Time-of-day greeting (+ visitor's first name when signed in). Static. -->
<template>
  <LandingWidgetShell :value="greeting" :sub="dateStr" icon="lucide:sun">
    <template v-if="name" #default>
      <span class="glass-widget__sub -mt-0.5">{{ name }}</span>
    </template>
  </LandingWidgetShell>
</template>

<script setup lang="ts">
import LandingWidgetShell from "./LandingWidgetShell.vue";

defineProps<{ name?: string | null }>();

// Computed on the client (onMounted) to avoid an SSR hydration mismatch on the hour.
const greeting = ref("Welcome");
const dateStr = ref("");

onMounted(() => {
  const now = new Date();
  const h = now.getHours();
  greeting.value = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  dateStr.value = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
});
</script>
