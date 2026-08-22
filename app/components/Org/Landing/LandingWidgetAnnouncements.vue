<!--
  How much the community communicates — total notices sent, since when, and how
  often. A count and a cadence, never a subject line: this sits on the PUBLIC
  landing, and "we tell residents things, regularly" is the claim it makes.

  Stats are computed server-side in /api/hoa/find so nothing about the emails
  themselves reaches the page. Self-hides when the community has sent nothing,
  like every other widget in the row.
-->
<template>
  <LandingWidgetShell
    v-if="stats && stats.total > 0"
    :value="stats.total"
    :label="stats.total === 1 ? 'Announcement' : 'Announcements'"
    icon="lucide:megaphone"
    :sub="sinceLabel"
  >
    <span v-if="stats.avg_per_month" class="glass-widget__sub opacity-70">
      {{ stats.avg_per_month }} avg/mo
    </span>
  </LandingWidgetShell>
</template>

<script setup lang="ts">
import LandingWidgetShell from "./LandingWidgetShell.vue";

const props = defineProps<{
  /** { total, since, avg_per_month } from /api/hoa/find. */
  stats?: { total: number; since: string; avg_per_month: number | null } | null;
}>();

const stats = computed(() => props.stats ?? null);

// "Since May 2023". Month + year only — the exact day of the first notice is
// noise, and the point is how long the community has been at it.
const sinceLabel = computed(() => {
  const raw = stats.value?.since;
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return `Since ${d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
});
</script>
