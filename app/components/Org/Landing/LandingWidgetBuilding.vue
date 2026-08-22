<!-- Community size widget.
     Prefers the UNIT count when the org has units — a building is described
     better by how many homes it holds than by how many member records exist,
     and `member_count` is denormalized so it drifts. Falls back to the member
     count for an org that has not entered units yet. -->
<template>
  <LandingWidgetShell
    v-if="value > 0"
    :value="value"
    :label="valueLabel"
    icon="lucide:building-2"
    :sub="sub"
  />
</template>

<script setup lang="ts">
import LandingWidgetShell from "./LandingWidgetShell.vue";
import { orgMemberLabel, type OrgType } from "#core/shared/utils/terminology";

const props = defineProps<{
  count?: number | null;
  type?: OrgType;
  /** { total, owner_occupied, ownership_pct } from /api/hoa/find. */
  unitStats?: { total: number; owner_occupied: number; ownership_pct: number | null } | null;
}>();

const units = computed(() => props.unitStats?.total || 0);
const value = computed(() => units.value || Number(props.count) || 0);

const memberLabel = computed(() => orgMemberLabel(props.type));
const valueLabel = computed(() =>
  units.value
    ? units.value === 1
      ? "Unit"
      : "Units"
    : value.value === 1
      ? memberLabel.value.singular
      : memberLabel.value.plural
);

// "18 owner-occupied · 64% ownership" when occupancy has been recorded; the
// plain fallback while it has not, rather than an invented 0%.
const sub = computed(() => {
  const s = props.unitStats;
  if (!units.value || !s?.ownership_pct) return "In the community";
  return `${s.owner_occupied} owner-occupied · ${s.ownership_pct}% ownership`;
});
</script>
