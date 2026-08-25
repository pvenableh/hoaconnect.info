<script setup lang="ts">
/**
 * GlanceRail — the numbers, without the cards.
 *
 * This absorbs the METRIC halves of the dashboard's chart widgets so the stacks
 * above it can stay verbs-only: the stacks say what needs you, this says how
 * the community is doing, and neither has to be both. Deliberately NOT
 * `ios-card` tiles — five bordered boxes directly under a glass band is five
 * more surfaces competing with the thing that actually wants attention. A
 * hairline-separated rail of figures reads as a caption to the band above it.
 *
 * ── It runs no queries of its own ───────────────────────────────────────────
 * Every number comes from `useHomeGlances`, the shared reads that the
 * Collections / Requests-health / Occupancy widgets also consume. That is the
 * plan's rule for this component, and it is load-bearing: a dashboard showing
 * both this rail and those widgets makes ONE request per collection, because a
 * shared `useAsyncData` key IS one piece of state.
 *
 * A tile hides when its module is off — a community with Payments switched off
 * should not be told what it is owed. A ZERO does not hide it: "$0 past due" is
 * the good news this rail exists to deliver.
 */
import { moneyShort } from "#core/shared/home/glances";

const { isEnabled } = useModules();
const { buildOrgPath } = useOrgNavigation();
const channelsPanel = useChannelsPanel();

const money = await useMoneyGlance();
const requests = await useRequestsGlance();
const units = await useUnitsGlance();
const members = await useMembersGlance();
const { total: unreadTotal, refresh: refreshUnread } = useChannelUnread();

onMounted(() => {
  void refreshUnread();
});

interface Tile {
  key: string;
  label: string;
  value: string;
  sub: string;
  to?: string;
  onClick?: () => void;
  title: string;
  /** Draws the figure in the destructive tone — a number that is a problem. */
  alarm?: boolean;
}

const tiles = computed<Tile[]>(() => {
  const out: Tile[] = [];

  if (isEnabled("payments")) {
    const n = money.pastDueCount.value;
    out.push({
      key: "past-due",
      label: "Past due",
      value: moneyShort(money.pastDueTotal.value),
      sub: n ? `${n} charge${n === 1 ? "" : "s"}` : "nothing overdue",
      to: "/admin/payments",
      title: "Open Payments",
      alarm: money.pastDueTotal.value > 0,
    });
  }

  if (isEnabled("requests")) {
    const stale = requests.stale.value;
    out.push({
      key: "requests",
      label: "Open",
      value: String(requests.open.value),
      sub: stale ? `${stale} over 30 days` : "requests",
      to: "/admin/requests",
      title: "Open Requests",
      alarm: stale > 0,
    });
  }

  if (isEnabled("directory")) {
    out.push({
      key: "homes",
      label: "Homes",
      value: String(units.total.value),
      sub: units.ownerPct.value == null ? "units" : `${units.ownerPct.value}% owner-occupied`,
      to: "/admin/units",
      title: "Open Units",
    });
    out.push({
      key: "members",
      label: "Members",
      value: String(members.total.value),
      sub: `${members.owners.value} owner${members.owners.value === 1 ? "" : "s"}`,
      to: "/admin/members",
      title: "Open Members",
    });
  }

  out.push({
    key: "unread",
    label: "Unread",
    value: String(unreadTotal.value || 0),
    sub: "messages",
    onClick: () => channelsPanel.open(),
    title: "Open Channels",
    alarm: false,
  });

  return out;
});

function go(tile: Tile) {
  if (tile.onClick) return tile.onClick();
  if (tile.to) return navigateTo(buildOrgPath(tile.to));
}
</script>

<template>
  <div class="glance-rail" aria-label="Community at a glance">
    <button
      v-for="tile in tiles"
      :key="tile.key"
      type="button"
      class="glance-rail__tile"
      :title="tile.title"
      @click="go(tile)"
    >
      <span class="glance-rail__label">{{ tile.label }}</span>
      <span class="glance-rail__value" :class="{ 'is-alarm': tile.alarm }">{{ tile.value }}</span>
      <span class="glance-rail__sub">{{ tile.sub }}</span>
    </button>
  </div>
</template>

<style scoped>
.glance-rail {
  display: grid;
  /* Three across on a phone would put a $ figure on two lines. Two, then as
     many as fit. */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: color-mix(in srgb, var(--theme-text-primary, #000) 8%, transparent);
  border-radius: 18px;
  overflow: hidden;
}
@media (min-width: 640px) {
  .glance-rail {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  }
}

/* The hairlines are the 1px grid gap showing through; each tile paints the
   page ground over it. No borders, so nothing here adds to the Phase 8 census. */
.glance-rail__tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  text-align: left;
  background: var(--theme-bg-primary, transparent);
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.glance-rail__tile:focus-visible {
  outline: 2px solid var(--theme-accent-primary, currentColor);
  outline-offset: -2px;
}
@media (hover: hover) {
  .glance-rail__tile:hover {
    background: var(--theme-bg-secondary, transparent);
  }
}

.glance-rail__label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-text-muted);
}
.glance-rail__value {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: var(--theme-text-primary);
}
.glance-rail__value.is-alarm {
  color: var(--destructive);
}
.glance-rail__sub {
  font-size: 11px;
  color: var(--theme-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .glance-rail__tile {
    transition: none;
  }
}
</style>
