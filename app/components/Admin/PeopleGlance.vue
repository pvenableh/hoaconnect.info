<script setup lang="ts">
/**
 * The band at the top of People → Members: who lives here, in two charts and
 * three numbers.
 *
 * Fetches its own data rather than taking it from MembersPage. That page is
 * 1200 lines and already juggles four queries; threading two more counts
 * through it to reach a header strip would tangle them together for no gain.
 * The queries here ask for id-and-one-field only, so the cost is small.
 *
 * The two splits are deliberately NOT the same question, and the 1033 migration
 * proved it the hard way: an owner can own a unit they don't live in, so
 * residency counts PEOPLE and `hoa_units.occupancy` counts HOMES, and the two
 * numbers legitimately disagree. Showing one and labelling it the other is how
 * the building's ownership figure was wrong the first time.
 *
 * Residency comes from `residencyFor()` — the unit link first, the member's own
 * `member_type` as fallback — because this strip sits directly above the members
 * table on the same page. Reading the raw field here would let the glance call
 * someone an owner while the row beneath it calls them a tenant.
 */
import { residencyFor, RESIDENCY_UNIT_FIELDS } from "#core/shared/members/residency";

const { selectedOrgId } = await useSelectedOrg();
const { list: listUnits } = useDirectusItems("hoa_units");
const { list: listMembers } = useDirectusItems("hoa_members");
const { list: listBoard } = useDirectusItems("hoa_board_members");

const orgId = computed(() => selectedOrgId.value);

const { data, pending } = await useAsyncData(
  `people-glance-${orgId.value}`,
  async () => {
    if (!orgId.value) return null;

    // allSettled, not all. hoa_board_members has a live Directus permissions
    // gap on some roles, and a Promise.all would let that one 500 blank the
    // member and unit counts too — three independent numbers should fail
    // independently.
    const [units, members, board] = await Promise.allSettled([
      listUnits({
        fields: ["id", "occupancy"],
        filter: { organization: { _eq: orgId.value }, status: { _eq: "active" } },
        limit: -1,
      }) as Promise<any[]>,
      listMembers({
        fields: ["id", "member_type", ...RESIDENCY_UNIT_FIELDS],
        filter: { organization: { _eq: orgId.value }, status: { _eq: "active" } },
        limit: -1,
      }) as Promise<any[]>,
      // Board terms carry no `organization` of their own — they hang off the
      // member, so the org scope has to go through hoa_member. Filtering on a
      // field that isn't there is a FORBIDDEN 500, not an empty list.
      listBoard({
        fields: ["id", "term_end", "hoa_member.id"],
        filter: { hoa_member: { organization: { _eq: orgId.value } } },
        limit: -1,
      }) as Promise<any[]>,
    ]);

    const rows = (r: PromiseSettledResult<any[]>): any[] =>
      r.status === "fulfilled" ? r.value || [] : [];

    const count = (list: any[], pick: (r: any) => string | null | undefined) =>
      list.reduce<Record<string, number>>((acc, r) => {
        const k = pick(r) || "unknown";
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});

    const unitRows = rows(units);
    const memberRows = rows(members);

    // A seat is filled if the person's term hasn't ended. Counting ROWS would
    // count every historical term the community has ever recorded.
    const today = new Date().toISOString().slice(0, 10);
    const currentSeats = new Set(
      rows(board)
        .filter((t) => !t.term_end || String(t.term_end).slice(0, 10) >= today)
        .map((t) => (typeof t.hoa_member === "object" ? t.hoa_member?.id : t.hoa_member))
        .filter(Boolean),
    );

    return {
      units: unitRows.length,
      members: memberRows.length,
      boardSeats: currentSeats.size,
      // Distinguish "no board" from "couldn't read the board" — the card says
      // one and not the other.
      boardReadable: board.status === "fulfilled",
      occupancy: count(unitRows, (u) => u.occupancy),
      memberTypes: count(memberRows, (m) => residencyFor(m)),
    };
  },
  { watch: [orgId], server: false },
);

// Occupancy is null until somebody records it (only the migrated 1033 units
// carry it today). An "unknown: 28" donut is worse than no donut, so the card
// says what to do instead.
const occupancyRecorded = computed(() => {
  const o = data.value?.occupancy || {};
  return (o.owner || 0) + (o.tenant || 0) + (o.vacant || 0) > 0;
});

const ownerOccupiedPct = computed(() => {
  const o = data.value?.occupancy || {};
  const known = (o.owner || 0) + (o.tenant || 0) + (o.vacant || 0);
  return known ? Math.round(((o.owner || 0) / known) * 100) : null;
});

const OCCUPANCY_SERIES = [
  { key: "owner", label: "Owner-occupied", color: "var(--chart-1)" },
  { key: "tenant", label: "Tenanted", color: "var(--chart-3)" },
  { key: "vacant", label: "Vacant", color: CHART_STATUS_VARS.muted },
];

const MEMBER_TYPE_SERIES = [
  { key: "owner", label: "Owners", color: "var(--chart-1)" },
  { key: "tenant", label: "Tenants", color: "var(--chart-3)" },
  { key: "unknown", label: "Unrecorded", color: CHART_STATUS_VARS.muted },
];

// Drop a series nobody is in, so a community of only owners gets a clean legend
// rather than three swatches and two zeros.
const memberTypeSeries = computed(() =>
  MEMBER_TYPE_SERIES.filter((s) => (data.value?.memberTypes?.[s.key] || 0) > 0),
);
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-4">
    <div class="grid gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-1 lg:content-start">
      <AppStatCard
        label="Members"
        icon="lucide:users-round"
        :value="data?.members ?? 0"
        :loading="pending"
        description="Active records in the directory"
      />
      <AppStatCard
        label="Units"
        icon="lucide:door-closed"
        :value="data?.units ?? 0"
        :loading="pending"
        :description="
          ownerOccupiedPct == null
            ? 'Occupancy not recorded yet'
            : `${ownerOccupiedPct}% owner-occupied`
        "
      />
      <AppStatCard
        label="Board seats filled"
        icon="lucide:award"
        :value="data && !data.boardReadable ? '—' : (data?.boardSeats ?? 0)"
        :loading="pending"
        :description="data && !data.boardReadable ? 'Board roster unavailable' : 'Terms running today'"
      />
    </div>

    <AppChartCard
      class="lg:col-span-1"
      title="Members by type"
      hint="Who is on the directory"
      icon="lucide:pie-chart"
      :loading="pending"
      :empty="!data?.members"
      empty-title="No members yet"
      empty-hint="Add or invite residents and this fills in."
      :height="180"
    >
      <AppChartDonut
        :series="memberTypeSeries"
        :values="data?.memberTypes ?? {}"
        :height="180"
        center-label="members"
      />
    </AppChartCard>

    <AppChartCard
      class="lg:col-span-1"
      title="Homes by occupancy"
      hint="Who lives in them"
      icon="lucide:house"
      :loading="pending"
      :empty="!occupancyRecorded"
      empty-title="Occupancy not recorded"
      empty-hint="Set owner, tenant, or vacant on a unit and this chart appears."
      :height="180"
    >
      <AppChartDonut
        :series="OCCUPANCY_SERIES"
        :values="data?.occupancy ?? {}"
        :height="180"
        center-label="homes"
      />
    </AppChartCard>
  </div>
</template>
