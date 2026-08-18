<!--
  OrgTimeline — Phase 3 org-wide "all projects" timeline. One lane per project
  drawn as a coloured line across a shared date axis, milestones as stations,
  a today marker, and subway-map branches connecting a spawned project's lane
  back to the milestone it grew from. GSAP staggers the lanes in.
-->
<script setup lang="ts">
import type { ProjectRow } from "#core/app/composables/useProjects";
import { useProjects, PROJECT_STATUS_META } from "#core/app/composables/useProjects";
import { parseDateOnly } from "#core/shared/projects/schedule";

const emit = defineEmits<{ (e: "open", id: string): void }>();

const { $gsap } = useNuxtApp();
const { timeline } = useProjects();

const PX_PER_DAY = 4;
const LANE_H = 52;
const MS_DAY = 86_400_000;
const LABEL_W = 176;

const { data: projects, pending } = await useAsyncData("org-timeline", () => timeline(), {
  server: false,
  default: () => [] as ProjectRow[],
});

const laneRef = ref<HTMLElement | null>(null);

/** Projects that actually have a position on the timeline. */
const positioned = computed(() =>
  (projects.value || []).filter((p) => p.start_date || p.due_date || (p.events || []).some((e: any) => e.event_date))
);

function projDates(p: ProjectRow): { start: number | null; end: number | null } {
  const xs: number[] = [];
  if (p.start_date) xs.push(parseDateOnly(p.start_date)!.getTime());
  if (p.due_date) xs.push(parseDateOnly(p.due_date)!.getTime());
  if (p.completion_date) xs.push(parseDateOnly(p.completion_date)!.getTime());
  for (const e of p.events || []) {
    const t = parseDateOnly((e as any).event_date)?.getTime();
    const en = parseDateOnly((e as any).end_date || (e as any).event_date)?.getTime();
    if (t) xs.push(t);
    if (en) xs.push(en);
  }
  if (!xs.length) return { start: null, end: null };
  return { start: Math.min(...xs), end: Math.max(...xs) };
}

const range = computed(() => {
  const xs: number[] = [Date.now()];
  for (const p of positioned.value) {
    const { start, end } = projDates(p);
    if (start) xs.push(start);
    if (end) xs.push(end);
  }
  const min = Math.min(...xs) - 7 * MS_DAY;
  const max = Math.max(...xs) + 14 * MS_DAY;
  return { min, max };
});

const totalDays = computed(() => Math.max(1, Math.round((range.value.max - range.value.min) / MS_DAY)));
const canvasWidth = computed(() => Math.max(320, totalDays.value * PX_PER_DAY));
const xOf = (t: number | null) => (t == null ? 0 : Math.round(((t - range.value.min) / MS_DAY) * PX_PER_DAY));
const todayX = computed(() => xOf(Date.now()));

const months = computed(() => {
  const out: { x: number; label: string }[] = [];
  const start = new Date(range.value.min);
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cur.getTime() <= range.value.max) {
    out.push({ x: xOf(cur.getTime()), label: cur.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
});

const lanes = computed(() =>
  positioned.value.map((p, i) => {
    const { start, end } = projDates(p);
    const x1 = xOf(start ?? end);
    const x2 = Math.max(x1 + 8, xOf(end ?? start));
    const color = p.color || (typeof p.team === "object" ? p.team?.color : null) || "var(--theme-accent-primary)";
    const stations = (p.events || [])
      .filter((e: any) => e.event_date)
      .map((e: any) => ({
        id: e.id,
        x: xOf(parseDateOnly(e.event_date)!.getTime()),
        milestone: !!e.is_milestone,
        title: e.title,
        approval: e.approval,
      }));
    return { p, i, y: i * LANE_H, x1, x2, color, stations };
  })
);

const laneByProject = computed(() => new Map(lanes.value.map((l) => [l.p.id, l])));

/** Branches: a spawned project's lane connects back to its parent_event. */
const branches = computed(() => {
  const out: { d: string; color: string }[] = [];
  for (const l of lanes.value) {
    const pe = l.p.parent_event;
    if (pe && typeof pe === "object") {
      const parentProjId = typeof (pe as any).project === "object" ? (pe as any).project?.id : (pe as any).project;
      const parentLane = parentProjId ? laneByProject.value.get(parentProjId) : null;
      if (parentLane) {
        // From the parent event's station (or parent lane start) down to this lane.
        const station = parentLane.stations.find((s) => s.id === (pe as any).id);
        const x1 = station ? station.x : parentLane.x1;
        const y1 = parentLane.y + LANE_H / 2;
        const x2 = l.x1;
        const y2 = l.y + LANE_H / 2;
        out.push({ d: `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`, color: l.color });
      }
    }
  }
  return out;
});

const totalHeight = computed(() => Math.max(LANE_H, lanes.value.length * LANE_H));

watch([lanes, pending], async () => {
  await nextTick();
  if (!$gsap || !laneRef.value || pending.value) return;
  const els = laneRef.value.querySelectorAll<HTMLElement>("[data-lane]");
  $gsap.fromTo(els, { scaleX: 0, opacity: 0, transformOrigin: "left center" }, { scaleX: 1, opacity: 1, duration: 0.55, stagger: 0.05, ease: "power2.out" });
});
</script>

<template>
  <div>
    <div v-if="pending" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

    <div v-else-if="!positioned.length" class="ios-card p-12 text-center">
      <div class="w-14 h-14 rounded-full t-bg-subtle flex items-center justify-center mx-auto mb-3">
        <Icon name="lucide:gantt-chart" class="w-7 h-7 t-text-muted" />
      </div>
      <p class="t-text-secondary font-medium">Nothing scheduled yet</p>
      <p class="t-text-muted text-sm mt-1">Add start/due dates or milestones to see projects on the timeline.</p>
    </div>

    <div v-else class="ios-card overflow-hidden">
      <div class="flex">
        <!-- Labels -->
        <div class="shrink-0 border-r border-[var(--theme-border-light)]" :style="{ width: LABEL_W + 'px' }">
          <div class="h-7 border-b border-[var(--theme-border-light)]" />
          <button
            v-for="l in lanes"
            :key="l.p.id"
            class="flex items-center gap-2 w-full text-left px-3 hover:t-bg-subtle transition-colors"
            :style="{ height: LANE_H + 'px' }"
            @click="emit('open', l.p.id)"
          >
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: l.color }" />
            <span class="min-w-0">
              <span class="block text-xs font-medium t-text truncate">{{ l.p.title }}</span>
              <span class="block text-[10px] t-text-muted">{{ PROJECT_STATUS_META[(l.p.status as string) || 'planning']?.label }}</span>
            </span>
          </button>
        </div>

        <!-- Canvas -->
        <div class="overflow-x-auto flex-1">
          <div ref="laneRef" class="relative" :style="{ width: canvasWidth + 'px' }">
            <div class="relative h-7 border-b border-[var(--theme-border-light)]">
              <div v-for="m in months" :key="m.x" class="absolute top-0 bottom-0 flex items-center pl-1.5" :style="{ left: m.x + 'px' }">
                <span class="absolute left-0 top-0 bottom-0 w-px bg-[var(--theme-border-light)]" />
                <span class="text-[10px] uppercase tracking-wide t-text-tertiary">{{ m.label }}</span>
              </div>
            </div>

            <div class="relative" :style="{ height: totalHeight + 'px' }">
              <span v-for="m in months" :key="'g' + m.x" class="absolute top-0 bottom-0 w-px bg-[var(--theme-border-light)] opacity-50" :style="{ left: m.x + 'px' }" />
              <span v-if="todayX >= 0 && todayX <= canvasWidth" class="absolute top-0 bottom-0 w-px z-10" style="background: var(--theme-accent-primary)" :style="{ left: todayX + 'px' }">
                <span class="absolute -top-0.5 -left-1 w-2 h-2 rounded-full" style="background: var(--theme-accent-primary)" />
              </span>

              <svg class="absolute inset-0 pointer-events-none" :width="canvasWidth" :height="totalHeight">
                <path v-for="(b, bi) in branches" :key="bi" :d="b.d" fill="none" :stroke="b.color" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.6" />
              </svg>

              <!-- lanes -->
              <div
                v-for="l in lanes"
                :key="l.p.id"
                class="absolute"
                :style="{ top: l.y + LANE_H / 2 - 3 + 'px', left: l.x1 + 'px' }"
              >
                <div
                  data-lane
                  class="h-1.5 rounded-full cursor-pointer"
                  :style="{ width: (l.x2 - l.x1) + 'px', background: l.color, opacity: 0.85 }"
                  @click="emit('open', l.p.id)"
                />
                <!-- stations -->
                <button
                  v-for="s in l.stations"
                  :key="s.id"
                  type="button"
                  class="absolute -top-1 -translate-x-1/2"
                  :style="{ left: (s.x - l.x1) + 'px' }"
                  :title="s.title"
                  @click="emit('open', l.p.id)"
                >
                  <span
                    class="block"
                    :class="s.milestone ? 'w-3 h-3 rotate-45' : 'w-2.5 h-2.5 rounded-full'"
                    :style="{ background: s.approval === 'approved' ? '#10b981' : s.approval === 'needs_approval' ? '#f59e0b' : l.color, border: '1.5px solid var(--theme-bg-elevated)' }"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
