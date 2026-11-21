<script setup lang="ts">
/**
 * HomeManagerGlance — band 2 for a property manager: how much is open in each
 * delegated area (load bars) and how fast items are finished (weekly sparkline).
 * The bars are per community: one bar for each community this manager works.
 */
import type { RoleContext } from "#core/shared/roles/role-context";

const props = defineProps<{ roleContext: RoleContext | null | undefined }>();
const { communityLoad, response } = useManagerHome(toRef(props, "roleContext"));
// The busiest area fills the bar; the others are drawn against it.
const max = computed(() => Math.max(1, ...communityLoad.value.map((b) => b.open)));
const hasResponse = computed(() => response.value.some((v) => v > 0));
</script>

<template>
  <div class="space-y-3" data-testid="home-manager-glance">
    <h2 class="t-eyebrow">At a glance</h2>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AppCard class="space-y-3 p-4" data-testid="home-load-bars">
        <p class="text-sm font-medium t-text">Open by community</p>
        <div v-for="b in communityLoad" :key="b.id" data-testid="home-load-bar">
          <div class="mb-1 flex justify-between text-sm">
            <span class="t-text">{{ b.name }}</span>
            <span class="t-text-muted">{{ b.open }} open</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-muted" role="img" :aria-label="`${b.name}: ${b.open} open`">
            <div class="h-full rounded-full transition-[width] duration-300" :style="{ width: `${(b.open / max) * 100}%`, background: 'var(--chart-1)' }" />
          </div>
        </div>
        <!-- allow-bare-empty: a note inside a glance card, not a page's empty state -->
        <p v-if="!communityLoad.length" class="text-sm t-text-muted">No communities yet.</p>
      </AppCard>
      <AppCard class="p-4" data-testid="home-response-spark">
        <p class="text-sm font-medium t-text">Hours to finish, last 8 weeks</p>
        <AppChartSparkline v-if="hasResponse" :values="response" :width="220" :height="40" label="Average hours to finish, last 8 weeks" />
        <p v-else class="text-sm t-text-muted">Nothing finished in the last 8 weeks.</p>
      </AppCard>
    </div>
  </div>
</template>
