<script setup lang="ts">
/**
 * ChartRail — five quiet glances beside the stacks: how money came in, what is
 * still owed, how old the open queue is, who lives in the homes, and how much
 * mail went out this week.
 *
 * Ambience, not an analysis surface. The verbs live in the stacks; every glance
 * here only clicks through to the full surface that owns the question. They
 * rest at 45% opacity and reach full presence on hover — but ONLY inside
 * `@media (hover: hover)`. A touch screen has no hover to restore them with, so
 * resting dim there would leave five permanently unreadable tiles.
 *
 * ── Hand-rolled, and why ────────────────────────────────────────────────────
 * The `App/Chart/*` kit is unovis-backed and card-sized: axes, margins,
 * tooltips, a legend. In a 240px column at 36px tall those are all cost and no
 * information. What IS reused is the part that matters for coherence — the
 * colour meanings and the bucket arithmetic, both of which come from
 * `#core/shared/home/glances`, so a rail bar and its full chart can never
 * disagree about what "90 days +" is or what colour it should be.
 *
 * ── It runs no queries of its own ───────────────────────────────────────────
 * Same rule as GlanceRail: everything comes from `useHomeGlances`, shared with
 * the dashboard's chart widgets by `useAsyncData` key.
 *
 * Each glance self-hides when its own series is empty, so a young community
 * sees one or two rather than five empty frames — and if nothing has any data,
 * the rail does not render at all.
 */
import { money as fmtMoney, moneyShort } from "#core/shared/home/glances";

const HIDDEN_KEY = "hoa.home.rail-hidden";

const { isEnabled } = useModules();
const { buildOrgPath } = useOrgNavigation();

const moneyGlance = await useMoneyGlance();
const requests = await useRequestsGlance();
const units = await useUnitsGlance();
const email = await useEmailActivityGlance();

// ── Visibility (per-device) ──────────────────────────────────────────────────
const hidden = ref(false);

onMounted(() => {
  try {
    hidden.value = localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    /* private mode — default shown */
  }
});

function toggleHidden() {
  hidden.value = !hidden.value;
  try {
    localStorage.setItem(HIDDEN_KEY, hidden.value ? "1" : "0");
  } catch {
    /* fine */
  }
}

// ── Money in — 12 months, as a sparkline ─────────────────────────────────────
const SPARK_W = 100;
const SPARK_H = 36;

const cashPath = computed(() => {
  if (!isEnabled("payments") || !moneyGlance.hasCollections.value) return null;
  const values = moneyGlance.months.value.map((m) => m.collected);
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? SPARK_W / (values.length - 1) : SPARK_W;
  const pts = values.map((v, i) => {
    const x = i * step;
    // 2px of headroom top and bottom so a peak is not clipped by the viewBox.
    const y = SPARK_H - 2 - (v / max) * (SPARK_H - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return {
    line: `M${pts.join(" L")}`,
    area: `M0,${SPARK_H} L${pts.join(" L")} L${SPARK_W},${SPARK_H} Z`,
  };
});

// ── Outstanding — value by age ───────────────────────────────────────────────
const ageing = computed(() =>
  isEnabled("payments") && moneyGlance.hasOutstanding.value ? moneyGlance.ageing.value : null,
);
const ageingMax = computed(() => Math.max(...(ageing.value || []).map((b) => b.value), 1));

// ── Open requests — count by age ─────────────────────────────────────────────
const reqBuckets = computed(() =>
  isEnabled("requests") && requests.open.value > 0 ? requests.buckets.value : null,
);
const reqMax = computed(() => Math.max(...(reqBuckets.value || []).map((b) => b.count), 1));

// ── Homes — occupancy, as a hand-rolled donut ────────────────────────────────
const OCCUPANCY_SLICES = [
  { key: "owner", label: "Owner-occupied", color: "var(--chart-1)" },
  { key: "tenant", label: "Tenanted", color: "var(--chart-3)" },
  { key: "vacant", label: "Vacant", color: "var(--theme-text-muted)" },
];

const RADIUS = 15.9155; // circumference 100, so dasharray is a straight percent
const CIRC = 100;

const occupancy = computed(() => {
  if (!isEnabled("directory") || !units.recorded.value) return null;
  let offset = 0;
  const total = units.recorded.value;
  return OCCUPANCY_SLICES.map((s) => {
    const value = units.occupancy.value[s.key] || 0;
    const pct = (value / total) * CIRC;
    const arc = { ...s, value, pct, offset: -offset };
    offset += pct;
    return arc;
  }).filter((s) => s.value > 0);
});

// ── Mail — sends per day, this week ──────────────────────────────────────────
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

const mailDays = computed(() => {
  if (!email.sent7d.value) return null;
  return email.days.value.map((d) => ({
    date: d.date,
    sent: d.sent || 0,
    // Parsed as UTC noon so a date-only string does not slide a day backwards
    // in a western timezone.
    initial: DAY_INITIALS[new Date(`${d.date}T12:00:00Z`).getDay()] || "",
  }));
});
const mailMax = computed(() => Math.max(...(mailDays.value || []).map((d) => d.sent), 1));

const hasAnything = computed(
  () => !!(cashPath.value || ageing.value || reqBuckets.value || occupancy.value || mailDays.value),
);

// ── Motion ───────────────────────────────────────────────────────────────────
const railEl = ref<HTMLElement | null>(null);

const prefersReduced = () =>
  import.meta.client && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let gsapPromise: Promise<typeof import("gsap").gsap> | null = null;
async function loadGsap() {
  if (!import.meta.client) return null;
  if (!gsapPromise) gsapPromise = import("gsap").then((m) => m.gsap);
  try {
    return await gsapPromise;
  } catch {
    gsapPromise = null;
    return null;
  }
}

let animated = false;

async function animateIn() {
  if (animated || prefersReduced()) return;
  const gsap = await loadGsap();
  if (!gsap) return;
  await nextTick();
  const cards = railEl.value?.querySelectorAll(".rail__chart");
  if (!cards?.length) return;
  animated = true;
  gsap.from(cards, {
    autoAlpha: 0,
    y: 14,
    duration: 0.55,
    ease: "expo.out",
    stagger: 0.08,
    // `all`, not `transform`: autoAlpha writes an INLINE opacity, and an inline
    // value outranks the `:hover { opacity: 1 }` rule — leaving it behind would
    // freeze every glance at its resting 0.45 forever.
    clearProps: "all",
  });
}

onMounted(() => {
  if (hasAnything.value) void animateIn();
});

// The rail is v-if'd on data arriving, so on a cold load it does not exist at
// mount — there is nothing to animate until the reads land.
watch(hasAnything, (has) => {
  if (has) void animateIn();
});

function open(path: string) {
  return navigateTo(buildOrgPath(path));
}
</script>

<template>
  <aside v-if="hasAnything" ref="railEl" class="rail" :class="{ 'rail--hidden': hidden }" aria-label="Glance charts">
    <div class="rail__head">
      <span v-if="!hidden" class="rail__label">At a glance</span>
      <button
        type="button"
        class="rail__toggle"
        :title="hidden ? 'Show glance charts' : 'Hide glance charts'"
        :aria-label="hidden ? 'Show glance charts' : 'Hide glance charts'"
        @click="toggleHidden"
      >
        <Icon :name="hidden ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="w-3.5 h-3.5" />
        <span v-if="hidden">Show charts</span>
      </button>
    </div>

    <template v-if="!hidden">
      <!-- Money in — collected by month. -->
      <button
        v-if="cashPath"
        type="button"
        class="rail__chart"
        title="Open Payments"
        @click="open('/admin/payments')"
      >
        <div class="rail__chart-head">
          <span class="rail__chart-label">Money in</span>
          <span class="rail__chart-value">
            {{ moneyShort(moneyGlance.collected12mo.value) }}
            <em>12 mo</em>
          </span>
        </div>
        <svg :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`" preserveAspectRatio="none" class="rail__svg" aria-hidden="true">
          <path :d="cashPath.area" fill="color-mix(in srgb, var(--chart-1) 16%, transparent)" />
          <path
            :d="cashPath.line"
            fill="none"
            stroke="var(--chart-1)"
            stroke-width="1.5"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </button>

      <!-- Outstanding — what is owed, by how overdue. -->
      <button
        v-if="ageing"
        type="button"
        class="rail__chart"
        title="Open Payments"
        @click="open('/admin/payments')"
      >
        <div class="rail__chart-head">
          <span class="rail__chart-label">Outstanding</span>
          <span class="rail__chart-value">{{ moneyShort(moneyGlance.outstanding.value) }}</span>
        </div>
        <div class="rail__bars">
          <div
            v-for="b in ageing"
            :key="b.label"
            class="rail__bar-row"
            :title="`${b.label}: ${fmtMoney(b.value)}`"
          >
            <span class="rail__bar-label">{{ b.short }}</span>
            <span class="rail__bar-track">
              <span
                class="rail__bar-fill"
                :style="{
                  width: `${Math.max((b.value / ageingMax) * 100, b.value > 0 ? 4 : 0)}%`,
                  background: b.color,
                }"
              />
            </span>
          </div>
        </div>
      </button>

      <!-- Open requests — the queue, by age. -->
      <button
        v-if="reqBuckets"
        type="button"
        class="rail__chart"
        title="Open Requests"
        @click="open('/admin/requests')"
      >
        <div class="rail__chart-head">
          <span class="rail__chart-label">Open</span>
          <span class="rail__chart-value">
            {{ requests.open.value }}
            <em>requests</em>
          </span>
        </div>
        <div class="rail__bars">
          <div
            v-for="b in reqBuckets"
            :key="b.label"
            class="rail__bar-row"
            :title="`${b.label}: ${b.count}`"
          >
            <span class="rail__bar-label">{{ b.short }}</span>
            <span class="rail__bar-track">
              <span
                class="rail__bar-fill"
                :style="{
                  width: `${Math.max((b.count / reqMax) * 100, b.count > 0 ? 4 : 0)}%`,
                  background: b.color,
                }"
              />
            </span>
          </div>
        </div>
      </button>

      <!-- Homes — occupancy. -->
      <button
        v-if="occupancy"
        type="button"
        class="rail__chart"
        title="Open Units"
        @click="open('/admin/units')"
      >
        <div class="rail__chart-head">
          <span class="rail__chart-label">Homes</span>
          <span class="rail__chart-value">
            {{ units.recorded.value }}
            <em>recorded</em>
          </span>
        </div>
        <div class="rail__donut">
          <svg viewBox="0 0 40 40" class="rail__donut-svg" aria-hidden="true">
            <circle
              cx="20"
              cy="20"
              :r="RADIUS"
              fill="none"
              stroke="color-mix(in srgb, var(--theme-text-primary) 6%, transparent)"
              stroke-width="5"
            />
            <circle
              v-for="s in occupancy"
              :key="s.key"
              cx="20"
              cy="20"
              :r="RADIUS"
              fill="none"
              :stroke="s.color"
              stroke-width="5"
              :stroke-dasharray="`${s.pct} ${CIRC - s.pct}`"
              :stroke-dashoffset="s.offset"
              transform="rotate(-90 20 20)"
            />
          </svg>
          <ul class="rail__donut-key">
            <li v-for="s in occupancy" :key="s.key">
              <span class="rail__dot" :style="{ background: s.color }" />
              {{ s.label }}
              <b>{{ s.value }}</b>
            </li>
          </ul>
        </div>
      </button>

      <!-- Mail — sends per day this week. -->
      <button
        v-if="mailDays"
        type="button"
        class="rail__chart"
        title="Open Communications"
        @click="open('/admin/communications')"
      >
        <div class="rail__chart-head">
          <span class="rail__chart-label">Mail</span>
          <span class="rail__chart-value">
            {{ email.sent7d.value }}
            <em>sent 7d</em>
          </span>
        </div>
        <div class="rail__days">
          <div v-for="d in mailDays" :key="d.date" class="rail__day" :title="`${d.date}: ${d.sent}`">
            <span class="rail__day-track">
              <span
                class="rail__day-fill"
                :style="{ height: `${Math.max((d.sent / mailMax) * 100, d.sent > 0 ? 8 : 0)}%` }"
              />
            </span>
            <span class="rail__day-label">{{ d.initial }}</span>
          </div>
        </div>
      </button>
    </template>
  </aside>
</template>

<style scoped>
/* Mobile-first: below xl the rail sits UNDER the stacks in normal flow, so it
   is a full-width tile grid rather than a narrow column — a 240px column of
   five stacked cards would be an absurd amount of scrolling on a phone. */
.rail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 10px;
  width: 100%;
}
.rail__head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
}

@media (min-width: 1280px) {
  .rail {
    position: sticky;
    top: 88px;
    display: flex;
    flex-direction: column;
    width: 240px;
    /* A sticky column taller than the viewport traps its own bottom — with five
       glances on a short laptop screen that would hide the last one for good.
       Cap it and let the rail scroll internally instead. The subtraction covers
       the app header above the scroll container plus this rail's own sticky
       offset; erring tall would re-create the trap, so it errs short. */
    max-height: calc(100vh - 152px);
    overflow-y: auto;
    scrollbar-width: none;
  }
  .rail::-webkit-scrollbar {
    display: none;
  }
  .rail--hidden {
    width: auto;
    overflow: visible;
  }
}

.rail__label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme-text-muted);
}
.rail__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--theme-text-muted);
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease;
}
@media (hover: hover) {
  .rail__toggle:hover {
    color: var(--theme-text-primary);
    background: var(--theme-bg-secondary);
  }
}
.rail__toggle:focus-visible {
  outline: 2px solid var(--theme-accent-primary, currentColor);
  outline-offset: 2px;
}

.rail__chart {
  display: block;
  width: 100%;
  padding: 12px 14px;
  border-radius: 18px;
  text-align: left;
  cursor: pointer;
  background: var(--theme-bg-elevated);
  transition: opacity 0.3s ease;
}
/* Subdued at rest, full presence on hover/focus — but ONLY where hovering is
   possible. On a touch screen there is no hover to restore it, so resting at
   45% would leave these permanently dimmed with no way to read them. */
@media (hover: hover) {
  .rail__chart {
    opacity: 0.45;
  }
  .rail__chart:hover,
  .rail__chart:focus-visible {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rail__chart,
  .rail__toggle,
  .rail__bar-fill,
  .rail__day-fill {
    transition: none;
  }
}

.rail__chart-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.rail__chart-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-text-muted);
}
.rail__chart-value {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--theme-text-primary);
}
.rail__chart-value em {
  font-style: normal;
  font-weight: 400;
  font-size: 10px;
  color: var(--theme-text-muted);
}

.rail__svg {
  display: block;
  width: 100%;
  height: 36px;
}

.rail__bars {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.rail__bar-row {
  display: grid;
  grid-template-columns: 52px 1fr;
  align-items: center;
  gap: 8px;
}
.rail__bar-label {
  font-size: 10px;
  color: var(--theme-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail__bar-track {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-text-primary) 6%, transparent);
  overflow: hidden;
}
.rail__bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}

.rail__donut {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rail__donut-svg {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}
.rail__donut-key {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10px;
  color: var(--theme-text-muted);
}
.rail__donut-key li {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail__donut-key b {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--theme-text-primary);
}
.rail__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.rail__days {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 52px;
}
.rail__day {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  height: 100%;
}
.rail__day-track {
  flex: 1;
  display: flex;
  align-items: flex-end;
  border-radius: 5px;
  background: color-mix(in srgb, var(--theme-text-primary) 5%, transparent);
  overflow: hidden;
}
.rail__day-fill {
  display: block;
  width: 100%;
  border-radius: 5px 5px 0 0;
  background: var(--chart-2);
  transition: height 0.5s ease;
}
.rail__day-label {
  font-size: 9px;
  text-align: center;
  color: var(--theme-text-muted);
}
</style>
