<!--
  ProjectGantt — Phase 3 horizontal "subway map" timeline for ONE project.

  A compact Gantt: each milestone/phase is a row with a date-positioned bar on a
  shared time axis. Dependencies draw connector lines (the subway track);
  spawned projects branch off their milestone. A today marker anchors it.
  Editing a bar's dates runs the dependency cascade and asks to confirm the
  shift before writing. Approval + spawn actions live in the per-event panel.

  Falls back to a plain manager when events have no dates yet.
-->
<script setup lang="ts">
import { toast } from "vue-sonner";
import type { ProjectEventRow } from "#core/app/composables/useProjectEvents";
import { useProjectEvents, EVENT_TYPE_META } from "#core/app/composables/useProjectEvents";
import type { ScheduleShift } from "#core/shared/projects/schedule";
import { parseDateOnly } from "#core/shared/projects/schedule";
import { eventProgress } from "#core/shared/projects/timeline";

const props = defineProps<{ projectId: string; canWrite?: boolean }>();
const emit = defineEmits<{ (e: "changed"): void }>();

const { $gsap } = useNuxtApp();
const { buildOrgPath } = useOrgNavigation();
const {
  list, create, update, remove, previewEndDate,
  previewShifts, applyReschedule, requestApproval, decideApproval, spawnProject,
} = useProjectEvents();

const events = ref<ProjectEventRow[]>([]);
const loading = ref(true);
const selectedId = ref<string | null>(null);
const railRef = ref<HTMLElement | null>(null);

const PX_PER_DAY = 18;
const ROW_H = 44;
const MS_DAY = 86_400_000;

async function load() {
  loading.value = true;
  try {
    events.value = await list(props.projectId);
  } catch {
    events.value = [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const dated = computed(() => events.value.filter((e) => !!e.event_date));

/** [rangeStart, rangeEnd] padded a few days each side, including today. */
const range = computed(() => {
  const ds: number[] = [];
  for (const e of dated.value) {
    const s = parseDateOnly(e.event_date)?.getTime();
    const en = parseDateOnly(e.end_date || e.event_date)?.getTime();
    if (s) ds.push(s);
    if (en) ds.push(en);
  }
  ds.push(Date.now());
  const min = Math.min(...ds) - 3 * MS_DAY;
  const max = Math.max(...ds) + 5 * MS_DAY;
  return { min, max };
});

const totalDays = computed(() => Math.max(1, Math.round((range.value.max - range.value.min) / MS_DAY)));
const canvasWidth = computed(() => totalDays.value * PX_PER_DAY);

function xOf(dateStr: string | null | undefined): number {
  const t = parseDateOnly(dateStr)?.getTime();
  if (!t) return 0;
  return Math.round(((t - range.value.min) / MS_DAY) * PX_PER_DAY);
}

const todayX = computed(() => Math.round(((Date.now() - range.value.min) / MS_DAY) * PX_PER_DAY));

/** Month gridlines across the axis. */
const months = computed(() => {
  const out: { x: number; label: string }[] = [];
  const start = new Date(range.value.min);
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cur.getTime() <= range.value.max) {
    out.push({
      x: Math.round(((cur.getTime() - range.value.min) / MS_DAY) * PX_PER_DAY),
      label: cur.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
    });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
});

/** Row layout: rows follow event order; index → y. */
const rows = computed(() =>
  dated.value.map((e, i) => {
    const startX = xOf(e.event_date);
    const endX = Math.max(startX + 10, xOf(e.end_date || e.event_date));
    return {
      e,
      i,
      y: i * ROW_H,
      startX,
      endX,
      isMilestone: !!e.is_milestone || endX - startX < 12,
      progress: eventProgress(e),
    };
  })
);

const rowById = computed(() => new Map(rows.value.map((r) => [r.e.id, r])));

/** Dependency connectors (track) + spawned-project branches. */
const connectors = computed(() => {
  const out: { d: string; kind: "dep" | "branch"; color: string }[] = [];
  for (const r of rows.value) {
    // Dependency: from the dependency's end to this row's start.
    const depId = typeof r.e.depends_on === "object" ? r.e.depends_on?.id : r.e.depends_on;
    if (depId && rowById.value.has(depId)) {
      const from = rowById.value.get(depId)!;
      const x1 = from.endX, y1 = from.y + ROW_H / 2;
      const x2 = r.startX, y2 = r.y + ROW_H / 2;
      const mx = (x1 + x2) / 2;
      out.push({ d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, kind: "dep", color: "var(--theme-accent-primary)" });
    }
  }
  return out;
});

const totalHeight = computed(() => Math.max(ROW_H, rows.value.length * ROW_H));

watch(rows, async () => {
  await nextTick();
  if (!$gsap || !railRef.value) return;
  const bars = railRef.value.querySelectorAll<HTMLElement>("[data-bar]");
  $gsap.fromTo(
    bars,
    { scaleX: 0, opacity: 0, transformOrigin: "left center" },
    { scaleX: 1, opacity: 1, duration: 0.5, stagger: 0.04, ease: "power2.out" }
  );
});

const selected = computed(() => events.value.find((e) => e.id === selectedId.value) || null);
function selectEvent(id: string) {
  selectedId.value = selectedId.value === id ? null : id;
}

// ── Add milestone ───────────────────────────────────────────────────────────
const showAdd = ref(false);
const addForm = reactive({ title: "", type: "phase", event_date: "", duration_days: "", is_milestone: false });
const addEnd = computed(() =>
  addForm.event_date && addForm.duration_days ? previewEndDate(addForm.event_date, Number(addForm.duration_days)) : null
);
async function addEvent() {
  if (!addForm.title.trim()) return;
  await create(props.projectId, {
    title: addForm.title.trim(),
    type: addForm.type,
    event_date: addForm.event_date || null,
    duration_days: addForm.duration_days ? Number(addForm.duration_days) : null,
    is_milestone: addForm.is_milestone,
  });
  Object.assign(addForm, { title: "", type: "phase", event_date: "", duration_days: "", is_milestone: false });
  showAdd.value = false;
  await load();
  emit("changed");
}

// ── Reschedule (dependency cascade + confirm) ────────────────────────────────
const reForm = reactive({ event_date: "", duration_days: "" });
const pendingShifts = ref<ScheduleShift[] | null>(null);
const rescheduling = ref(false);

function openReschedule(e: ProjectEventRow) {
  reForm.event_date = e.event_date || "";
  reForm.duration_days = e.duration_days != null ? String(e.duration_days) : "";
  pendingShifts.value = null;
}

function reviewReschedule(e: ProjectEventRow) {
  const dur = reForm.duration_days ? Number(reForm.duration_days) : e.duration_days ?? null;
  const shifts = previewShifts(events.value, e.id, reForm.event_date || null, dur);
  if (!shifts.length) {
    toast.info("No date changes to apply");
    return;
  }
  pendingShifts.value = shifts;
}

async function confirmReschedule() {
  if (!pendingShifts.value) return;
  rescheduling.value = true;
  try {
    await applyReschedule(props.projectId, pendingShifts.value, events.value);
    pendingShifts.value = null;
    await load();
    emit("changed");
  } finally {
    rescheduling.value = false;
  }
}

// ── Approval ─────────────────────────────────────────────────────────────────
const approvalLink = ref<string | null>(null);
const linkCopied = ref(false);
async function onRequestApproval(e: ProjectEventRow) {
  const res = await requestApproval(e.id);
  approvalLink.value = res.link;
  linkCopied.value = false;
  await load();
  emit("changed");
}
async function copyLink() {
  if (!approvalLink.value) return;
  try {
    await navigator.clipboard.writeText(approvalLink.value);
    linkCopied.value = true;
    setTimeout(() => (linkCopied.value = false), 1800);
  } catch {
    /* clipboard blocked */
  }
}
async function onDecide(e: ProjectEventRow, decision: "approved" | "rejected") {
  const note = decision === "rejected" ? prompt("Add a note (optional):") || undefined : undefined;
  await decideApproval(e.id, decision, note);
  approvalLink.value = null;
  await load();
  emit("changed");
}

// ── Spawn project ────────────────────────────────────────────────────────────
async function onSpawn(e: ProjectEventRow) {
  const title = prompt("New project title:", `${e.title} — follow-up`);
  if (title === null) return;
  await spawnProject(e.id, { title: title.trim() || undefined });
  await load();
  emit("changed");
}

async function toggleDone(e: ProjectEventRow) {
  const next = e.status === "completed" ? "active" : "completed";
  await update(e.id, { status: next });
  await load();
  emit("changed");
}
async function removeEvent(e: ProjectEventRow) {
  if (!confirm(`Remove "${e.title}"?`)) return;
  if (selectedId.value === e.id) selectedId.value = null;
  await remove(e.id);
  await load();
  emit("changed");
}

const fmt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
const TYPE_OPTS = Object.entries(EVENT_TYPE_META).map(([value, m]) => ({ value, label: m.label }));

const APPROVAL_META: Record<string, { label: string; cls: string }> = {
  // Tint + strong text, matching the emerald/orange siblings below. NOT the
  // full `t-bg-accent` fill: it and `t-text-accent` are the same colour.
  needs_approval: { label: "Needs approval", cls: "t-bg-accent/15 t-text-accent" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  rejected: { label: "Sent back", cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
};
</script>

<template>
  <div>
    <div v-if="loading" class="py-10 flex justify-center"><div class="spinner-ios" /></div>

    <template v-else>
      <!-- Horizontal subway-map Gantt -->
      <div v-if="rows.length" class="ios-card overflow-hidden">
        <div class="flex">
          <!-- Sticky label column -->
          <div class="shrink-0 w-44 border-r border-[var(--theme-border-light)]">
            <div class="h-7 border-b border-[var(--theme-border-light)]" />
            <button
              v-for="r in rows"
              :key="r.e.id"
              class="flex items-center gap-1.5 w-full text-left px-3 truncate transition-colors"
              :class="selectedId === r.e.id ? 't-bg-subtle' : 'hover:t-bg-subtle'"
              :style="{ height: ROW_H + 'px' }"
              @click="selectEvent(r.e.id)"
            >
              <Icon :name="EVENT_TYPE_META[(r.e.type as string) || 'phase']?.icon" class="w-3.5 h-3.5 t-text-muted shrink-0" />
              <span class="text-xs font-medium t-text truncate" :class="r.e.status === 'completed' ? 'line-through t-text-muted' : ''">{{ r.e.title }}</span>
              <span v-if="r.progress" class="text-[10px] t-text-muted tabular-nums shrink-0">
                {{ r.progress.done }}/{{ r.progress.total }}
              </span>
            </button>
          </div>

          <!-- Scrollable canvas -->
          <div class="overflow-x-auto flex-1">
            <div ref="railRef" class="relative" :style="{ width: canvasWidth + 'px' }">
              <!-- Axis -->
              <div class="relative h-7 border-b border-[var(--theme-border-light)]">
                <div
                  v-for="m in months"
                  :key="m.x"
                  class="absolute top-0 bottom-0 flex items-center pl-1.5"
                  :style="{ left: m.x + 'px' }"
                >
                  <span class="absolute left-0 top-0 bottom-0 w-px bg-[var(--theme-border-light)]" />
                  <span class="text-[10px] uppercase tracking-wide t-text-tertiary">{{ m.label }}</span>
                </div>
              </div>

              <!-- Body -->
              <div class="relative" :style="{ height: totalHeight + 'px' }">
                <!-- month gridlines -->
                <span
                  v-for="m in months"
                  :key="'g' + m.x"
                  class="absolute top-0 bottom-0 w-px bg-[var(--theme-border-light)] opacity-60"
                  :style="{ left: m.x + 'px' }"
                />
                <!-- today marker -->
                <span
                  v-if="todayX >= 0 && todayX <= canvasWidth"
                  class="absolute top-0 bottom-0 w-px z-10"
                  style="background: var(--theme-accent-primary)"
                  :style="{ left: todayX + 'px' }"
                >
                  <span class="absolute -top-0.5 -left-1 w-2 h-2 rounded-full" style="background: var(--theme-accent-primary)" />
                </span>

                <!-- dependency / branch connectors -->
                <svg class="absolute inset-0 pointer-events-none" :width="canvasWidth" :height="totalHeight">
                  <path
                    v-for="(c, ci) in connectors"
                    :key="ci"
                    :d="c.d"
                    fill="none"
                    :stroke="c.color"
                    stroke-width="1.5"
                    stroke-dasharray="3 3"
                    opacity="0.55"
                  />
                </svg>

                <!-- bars / nodes -->
                <div
                  v-for="r in rows"
                  :key="r.e.id"
                  class="absolute"
                  :style="{ top: r.y + (ROW_H - 22) / 2 + 'px', left: r.startX + 'px' }"
                >
                  <button
                    data-bar
                    type="button"
                    class="h-[22px] rounded-full flex items-center px-2 gap-1 transition-shadow hover:shadow-md ring-1 ring-inset"
                    :class="[
                      r.e.status === 'completed' ? 'opacity-70' : '',
                      selectedId === r.e.id ? 'ring-2' : 'ring-[var(--theme-border-secondary)]',
                    ]"
                    :style="{
                      width: r.isMilestone ? '22px' : (r.endX - r.startX) + 'px',
                      background: r.e.status === 'completed' ? 'var(--theme-accent-primary)' : 'var(--theme-bg-elevated)',
                      ...(selectedId === r.e.id ? { '--tw-ring-color': 'var(--theme-accent-primary)' } : {}),
                    }"
                    :aria-label="
                      r.progress
                        ? `${r.e.title || 'Milestone'} — ${r.progress.done} of ${r.progress.total} tasks done`
                        : r.e.title || 'Milestone'
                    "
                    @click="selectEvent(r.e.id)"
                  >
                    <span
                      v-if="r.isMilestone"
                      class="w-2.5 h-2.5 rotate-45 shrink-0"
                      :style="{ background: r.e.status === 'completed' ? '#fff' : 'var(--theme-accent-primary)' }"
                    />
                    <!--
                      No tasks on the phase → the solid line it always had.
                      Tasks → a track with the completed share filled, so the
                      length of the bar is WHEN and the fill is HOW FAR.
                    -->
                    <span
                      v-else-if="!r.progress"
                      class="h-1.5 rounded-full flex-1"
                      :style="{ background: r.e.status === 'completed' ? '#fff' : 'var(--theme-accent-primary)', minWidth: '6px' }"
                    />
                    <span
                      v-else
                      class="relative h-1.5 rounded-full flex-1 overflow-hidden"
                      :style="{
                        background:
                          r.e.status === 'completed'
                            ? 'rgba(255,255,255,0.35)'
                            : 'color-mix(in srgb, var(--theme-accent-primary) 20%, transparent)',
                        minWidth: '6px',
                      }"
                    >
                      <span
                        class="absolute inset-y-0 left-0 rounded-full"
                        :style="{
                          width: r.progress.pct + '%',
                          background: r.e.status === 'completed' ? '#fff' : 'var(--theme-accent-primary)',
                        }"
                      />
                    </span>
                  </button>
                  <!-- spawned-project branch chips -->
                  <div
                    v-if="r.e.spawned_projects?.length"
                    class="absolute left-0 top-[24px] flex items-center gap-1"
                  >
                    <Icon name="lucide:corner-down-right" class="w-3 h-3 t-text-muted" />
                    <span class="text-[10px] t-text-accent whitespace-nowrap">
                      {{ r.e.spawned_projects.length }} spawned
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-else class="text-sm t-text-muted py-3 px-1">
        Add dates to your milestones to see them on the timeline.
      </p>

      <!-- Selected event panel -->
      <div v-if="selected" class="ios-card p-4 mt-3 space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <Icon :name="EVENT_TYPE_META[(selected.type as string) || 'phase']?.icon" class="w-4 h-4 t-text-muted" />
              <h3 class="font-semibold t-text truncate">{{ selected.title }}</h3>
              <span
                v-if="selected.approval && selected.approval !== 'none_needed'"
                class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                :class="APPROVAL_META[selected.approval as string]?.cls"
              >{{ APPROVAL_META[selected.approval as string]?.label }}</span>
            </div>
            <p class="text-xs t-text-muted mt-0.5">
              {{ fmt(selected.event_date) }}<template v-if="selected.end_date && selected.end_date !== selected.event_date"> → {{ fmt(selected.end_date) }}</template>
              <template v-if="selected.duration_days"> · {{ selected.duration_days }} business days</template>
            </p>
          </div>
          <button type="button" class="p-1 rounded hover:t-bg-subtle" aria-label="Close" @click="selectedId = null">
            <Icon name="lucide:x" class="w-4 h-4 t-text-muted" />
          </button>
        </div>

        <p v-if="selected.approval === 'rejected' && selected.approval_note" class="text-xs t-text-secondary t-bg-subtle rounded-lg px-2.5 py-1.5">
          <Icon name="lucide:message-square" class="w-3 h-3 inline -mt-0.5" /> {{ selected.approval_note }}
        </p>

        <template v-if="canWrite">
          <!-- Reschedule -->
          <details class="group" @toggle="(e) => (e.target as HTMLDetailsElement).open && openReschedule(selected!)">
            <summary class="text-sm font-medium t-text-accent cursor-pointer select-none inline-flex items-center gap-1">
              <Icon name="lucide:calendar-clock" class="w-4 h-4" />Reschedule
            </summary>
            <div class="mt-2 space-y-2 pl-1">
              <div class="grid grid-cols-2 gap-2">
                <label class="text-xs t-text-muted">Start date
                  <input v-model="reForm.event_date" type="date" class="t-input w-full rounded-lg px-2.5 py-1.5 text-sm mt-0.5" />
                </label>
                <label class="text-xs t-text-muted">Duration (business days)
                  <input v-model="reForm.duration_days" type="number" min="1" class="t-input w-full rounded-lg px-2.5 py-1.5 text-sm mt-0.5" />
                </label>
              </div>
              <Button size="sm" variant="outline" class="rounded-full" @click="reviewReschedule(selected!)">
                Review changes
              </Button>
            </div>
          </details>

          <!-- Approval actions -->
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <Button
              v-if="selected.approval !== 'needs_approval'"
              size="sm" variant="outline" class="rounded-full"
              @click="onRequestApproval(selected!)"
            >
              <Icon name="lucide:send" class="w-3.5 h-3.5 mr-1" />Request approval
            </Button>
            <template v-if="selected.approval === 'needs_approval'">
              <Button size="sm" class="rounded-full" @click="onDecide(selected!, 'approved')">
                <Icon name="lucide:check" class="w-3.5 h-3.5 mr-1" />Approve
              </Button>
              <Button size="sm" variant="outline" class="rounded-full" @click="onDecide(selected!, 'rejected')">Send back</Button>
            </template>
            <Button size="sm" variant="outline" class="rounded-full" @click="onSpawn(selected!)">
              <Icon name="lucide:git-branch-plus" class="w-3.5 h-3.5 mr-1" />Spawn project
            </Button>
            <Button size="sm" variant="ghost" class="rounded-full" @click="toggleDone(selected!)">
              {{ selected.status === "completed" ? "Reopen" : "Mark done" }}
            </Button>
            <button type="button" class="ml-auto p-1.5 rounded-full hover:t-bg-subtle text-red-600" aria-label="Remove" @click="removeEvent(selected!)">
              <Icon name="lucide:trash-2" class="w-4 h-4" />
            </button>
          </div>

          <!-- Approval link surfaced after request -->
          <div v-if="approvalLink && selected.approval === 'needs_approval'" class="t-bg-subtle rounded-lg p-2.5 flex items-center gap-2">
            <Icon name="lucide:link" class="w-4 h-4 t-text-muted shrink-0" />
            <input :value="approvalLink" readonly class="bg-transparent text-xs t-text-secondary flex-1 min-w-0 outline-none" @focus="($event.target as HTMLInputElement).select()" />
            <Button size="sm" variant="outline" class="rounded-full shrink-0" @click="copyLink">
              {{ linkCopied ? "Copied" : "Copy" }}
            </Button>
          </div>

          <!-- spawned projects list -->
          <div v-if="selected.spawned_projects?.length" class="pt-1">
            <p class="text-xs font-semibold t-text-secondary mb-1">Spawned projects</p>
            <NuxtLink
              v-for="sp in selected.spawned_projects"
              :key="sp.id"
              :to="buildOrgPath(`/admin/projects/${sp.id}`)"
              class="flex items-center gap-1.5 text-sm t-text hover:t-text-accent py-0.5"
            >
              <Icon name="lucide:corner-down-right" class="w-3.5 h-3.5 t-text-muted" />{{ sp.title }}
            </NuxtLink>
          </div>
        </template>
      </div>

      <!-- Add milestone -->
      <div v-if="canWrite" class="mt-3">
        <div v-if="showAdd" class="ios-card p-4 space-y-3">
          <input v-model="addForm.title" type="text" placeholder="Milestone / phase title" class="t-input w-full rounded-lg px-3 py-2 text-sm" />
          <div class="grid grid-cols-2 gap-2">
            <select v-model="addForm.type" class="t-input rounded-lg px-3 py-2 text-sm">
              <option v-for="o in TYPE_OPTS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <label class="flex items-center gap-2 text-sm t-text-secondary px-2">
              <input v-model="addForm.is_milestone" type="checkbox" class="rounded" /> Milestone marker
            </label>
            <input v-model="addForm.event_date" type="date" class="t-input rounded-lg px-3 py-2 text-sm" />
            <input v-model="addForm.duration_days" type="number" min="1" placeholder="Duration (business days)" class="t-input rounded-lg px-3 py-2 text-sm" />
          </div>
          <p v-if="addEnd" class="text-xs t-text-muted">Ends {{ fmt(addEnd) }} (business days)</p>
          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" class="rounded-full" @click="showAdd = false">Cancel</Button>
            <Button type="button" size="sm" class="rounded-full" :disabled="!addForm.title.trim()" @click="addEvent">Add</Button>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 text-sm t-text-accent hover:opacity-80 px-1"
          @click="showAdd = true"
        >
          <Icon name="lucide:plus" class="w-4 h-4" />Add milestone
        </button>
      </div>
    </template>

    <!-- Reschedule confirm-diff modal -->
    <Teleport to="body">
      <div v-if="pendingShifts" class="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="pendingShifts = null" />
        <div class="relative ios-card p-5 w-full max-w-md max-h-[80vh] overflow-y-auto">
          <h3 class="font-semibold t-text mb-1">Confirm schedule changes</h3>
          <p class="text-sm t-text-muted mb-3">
            {{ pendingShifts.length === 1 ? "This milestone will move." : `Moving this milestone shifts ${pendingShifts.length} dependent milestones.` }}
          </p>
          <ul class="space-y-2">
            <li v-for="s in pendingShifts" :key="s.id" class="flex items-center justify-between gap-2 text-sm">
              <span class="t-text truncate">{{ s.title || "Milestone" }}</span>
              <span class="t-text-muted whitespace-nowrap text-xs">
                {{ fmt(s.oldStart) }} → <span class="t-text-accent font-medium">{{ fmt(s.newStart) }}</span>
              </span>
            </li>
          </ul>
          <div class="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" class="rounded-full" :disabled="rescheduling" @click="pendingShifts = null">Cancel</Button>
            <Button size="sm" class="rounded-full" :disabled="rescheduling" @click="confirmReschedule">
              {{ rescheduling ? "Applying…" : "Apply changes" }}
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
