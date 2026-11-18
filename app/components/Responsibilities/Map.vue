<!--
  ResponsibilitiesMap — the register's Map mode (plan §3.4 "Map view", Phase 2c).

  Holders on one side, jobs on the other, for one day (`model`, from
  `mapModel` in core/shared/responsibilities/map.ts). Pick a holder and their
  jobs light up; pick a job and its owner, backup and oversight light up. Jobs
  nobody holds and offices nobody holds sit in their own groups, in the
  attention colour. Read-only: a picked job offers "Open", which the page turns
  into the job's panel, where hand-over and edit live.

  Material (§2.4): the holder rail is glass; job cards are solid content; no
  glass on glass. On a phone the two sides stack and the rail scrolls sideways.

  Motion: when the day moves, the jobs that changed holder get their new chips
  sliding in and a short pulse, and a job that loses or gains its last holder
  travels between its section and the Unassigned group (FLIP). Under
  prefers-reduced-motion all of it is instant, and the polite live region says
  what changed either way.
-->
<script setup lang="ts">
import { roleLabel } from "#core/shared/responsibilities/config";
import {
  changeAnnouncement,
  changedJobs,
  lit as litFor,
  longDay,
  type MapHolder,
  type MapJob,
  type MapJobHolder,
  type MapModel,
  type MapSelection,
} from "#core/shared/responsibilities/map";
import type { TargetKind } from "#core/shared/responsibilities/holders";

const props = withDefaults(
  defineProps<{
    model: MapModel;
    /** Offer "Open" on a picked job (the page opens its panel). */
    canOpen?: boolean;
  }>(),
  { canOpen: false },
);
const emit = defineEmits<{ open: [jobId: string] }>();
const selection = defineModel<MapSelection>("selection", { default: null });

const haptic = useHaptic();

// ── What lights up ─────────────────────────────────────────────────────────
const lit = computed(() => litFor(props.model, selection.value));
const litJobs = computed(() => new Set(lit.value?.jobs ?? []));
const litRoles = computed(() => {
  const m = new Map<string, string[]>();
  for (const h of lit.value?.holders ?? []) if (h.role) m.set(h.key, [...(m.get(h.key) ?? []), h.role]);
  return m;
});
const pickedHolder = computed(() => (lit.value && selection.value && "holder" in selection.value ? selection.value.holder : null));
const pickedJob = computed(() => (lit.value && selection.value && "job" in selection.value ? selection.value.job : null));

const railHolders = computed(() => [...props.model.vacant, ...props.model.holders]);
const allJobs = computed(() => [...props.model.unassigned, ...props.model.groups.flatMap((g) => g.jobs)]);
const jobCount = computed(() => allJobs.value.length);

function pickHolder(key: string | null) {
  const next: MapSelection = key ? { holder: key } : null;
  if (JSON.stringify(next) === JSON.stringify(selection.value)) return;
  haptic.selection();
  selection.value = next;
}
function pickJob(id: string) {
  haptic.tap();
  selection.value = pickedJob.value === id ? null : { job: id };
}

// ── The rail: a radio group, arrows move and pick, Home and End ─────────────
const railEl = ref<HTMLElement | null>(null);
const railKeys = computed(() => [null, ...railHolders.value.map((h) => h.key)] as (string | null)[]);
const checkedKey = computed(() => pickedHolder.value);

function onRailKey(e: KeyboardEvent) {
  const keys = railKeys.value;
  const at = Math.max(0, keys.indexOf(checkedKey.value));
  let to = at;
  if (e.key === "ArrowDown" || e.key === "ArrowRight") to = (at + 1) % keys.length;
  else if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = (at - 1 + keys.length) % keys.length;
  else if (e.key === "Home") to = 0;
  else if (e.key === "End") to = keys.length - 1;
  else return;
  e.preventDefault();
  pickHolder(keys[to] ?? null);
  void nextTick(() => {
    const el = railEl.value?.querySelectorAll<HTMLElement>("[role=radio]")[to];
    el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

// ── Words ───────────────────────────────────────────────────────────────────
const KIND_ICON: Record<TargetKind, string> = {
  office: "lucide:award",
  member: "lucide:user",
  user: "lucide:user",
  vendor: "lucide:building-2",
  team: "lucide:users",
  label: "lucide:tag",
};
const people = (h: Pick<MapHolder, "people">) => h.people.map((p) => p.name).join(", ");
const holderText = (h: MapJobHolder) => (h.kind === "office" ? `${h.name} (${h.vacant ? "vacant" : people(h)})` : h.name);
const jobsText = (n: number) => `${n} ${n === 1 ? "job" : "jobs"}`;
const shortDay = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, dd!)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/** The sentence over the jobs: what the pick lit. */
const pickSummary = computed(() => {
  if (pickedHolder.value) {
    const h = railHolders.value.find((x) => x.key === pickedHolder.value);
    if (!h) return "";
    const name = h.kind === "office" ? `${h.label} (${h.vacant ? "vacant" : people(h)})` : h.label;
    return `${name}: ${jobsText(litJobs.value.size)}.`;
  }
  if (pickedJob.value) {
    const j = allJobs.value.find((x) => x.id === pickedJob.value);
    if (!j) return "";
    if (!j.holders.length) return `${j.title}: nobody holds it.`;
    return `${j.title}: ${j.holders.map((h) => `${holderText(h)}, ${roleLabel(h.role).toLowerCase()}`).join("; ")}.`;
  }
  return "";
});

// ── When the day moves ──────────────────────────────────────────────────────
const jobsEl = ref<HTMLElement | null>(null);
const flip = useFlipList(jobsEl, { itemSelector: "[data-flip-id]", duration: 0.45, stagger: 0.01 });
const changed = ref<Set<string>>(new Set());
const pulse = ref(0);
const announcement = ref("");
let announceTimer: ReturnType<typeof setTimeout> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

// Pre-flush: the DOM still shows the old day, so FLIP can measure it.
watch(
  () => props.model,
  (next, prev) => {
    if (!prev || prev.day === next.day) return;
    const changes = changedJobs(prev, next);
    changed.value = new Set(changes.map((c) => c.id));
    pulse.value++;
    if (changes.length) {
      haptic.detentSnap();
      flip.capture();
      void flip.play();
    }
    // A drag crosses many days: say where it settled, once.
    if (announceTimer) clearTimeout(announceTimer);
    const text = changeAnnouncement(next.day, changes);
    announceTimer = setTimeout(() => (announcement.value = text), 450);
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => (changed.value = new Set()), 1600);
  },
);
onBeforeUnmount(() => {
  if (announceTimer) clearTimeout(announceTimer);
  if (clearTimer) clearTimeout(clearTimer);
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && selection.value) {
    selection.value = null;
    e.stopPropagation();
  }
}

const jobClasses = (j: MapJob) => ({
  "rmap-job--lit": litJobs.value.has(j.id),
  "rmap-job--picked": pickedJob.value === j.id,
  "rmap-job--attention": !j.holders.length,
  "rmap-job--changed": changed.value.has(j.id),
});
</script>

<template>
  <div class="rmap" :class="{ 'rmap--picking': !!lit }" data-register-view="map" @keydown="onKeydown">
    <p class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</p>

    <!-- The rail: everyone who holds a job that day. Glass, over the page. -->
    <nav class="rmap-rail glass-surface" aria-label="Holders">
      <p class="type-micro t-text-muted rmap-rail__title" id="rmap-rail-label">Holders · {{ longDay(model.day) }}</p>
      <div
        ref="railEl"
        role="radiogroup"
        aria-labelledby="rmap-rail-label"
        class="rmap-rail__list"
        @keydown="onRailKey"
      >
        <!-- allow-raw-button: a radio in the holder rail; its own glass row, roving tabindex -->
        <button
          type="button"
          role="radio"
          :aria-checked="checkedKey === null"
          :tabindex="checkedKey === null ? 0 : -1"
          class="rmap-holder"
          :class="{ 'rmap-holder--checked': checkedKey === null }"
          @click="pickHolder(null)"
        >
          <Icon name="lucide:layout-grid" class="rmap-holder__icon" aria-hidden="true" />
          <span class="rmap-holder__text">
            <span class="rmap-holder__name text-sm">Everyone</span>
            <span class="rmap-holder__sub text-xs">{{ jobsText(jobCount) }}</span>
          </span>
        </button>

        <template v-for="(h, i) in railHolders" :key="h.key">
          <p v-if="i === 0 && h.vacant" class="type-micro text-warning rmap-rail__group">Vacant</p>
          <p v-else-if="i === model.vacant.length && model.vacant.length" class="type-micro t-text-muted rmap-rail__group">
            Holding jobs
          </p>
          <!-- allow-raw-button: a radio in the holder rail; its own glass row, roving tabindex -->
          <button
            type="button"
            role="radio"
            :aria-checked="checkedKey === h.key"
            :tabindex="checkedKey === h.key ? 0 : -1"
            class="rmap-holder"
            :class="{
              'rmap-holder--checked': checkedKey === h.key,
              'rmap-holder--lit': litRoles.has(h.key),
              'rmap-holder--attention': h.vacant,
            }"
            @click="pickHolder(h.key)"
          >
            <Icon :name="KIND_ICON[h.kind]" class="rmap-holder__icon" aria-hidden="true" />
            <span class="rmap-holder__text">
              <span class="rmap-holder__name text-sm">{{ h.label }}</span>
              <span v-if="h.kind === 'office'" class="rmap-holder__sub text-xs" :class="{ 'text-warning': h.vacant }">
                {{ h.vacant ? "Vacant" : people(h) }}
              </span>
              <span v-if="litRoles.has(h.key)" class="rmap-holder__role text-xs">
                {{ litRoles.get(h.key)!.map((r) => roleLabel(r)).join(", ") }}
              </span>
            </span>
            <span class="rmap-holder__count text-xs tabular-nums" aria-hidden="true">{{ h.jobCount }}</span>
            <span class="sr-only">, {{ jobsText(h.jobCount) }}</span>
          </button>
        </template>
      </div>
    </nav>

    <!-- The jobs: solid cards, in the attention group and the five sections. -->
    <div ref="jobsEl" class="rmap-jobs">
      <p class="type-meta t-text-secondary rmap-jobs__summary" aria-live="polite">
        {{ pickSummary || `${jobsText(jobCount)}. Pick a holder to light up their jobs, or a job to see who holds it.` }}
      </p>

      <section v-if="model.unassigned.length" class="rmap-section" aria-labelledby="rmap-sec-unassigned">
        <!-- allow-heading-label: the section is in the outline (screen-reader heading jumps) and reads as a label -->
        <h2 id="rmap-sec-unassigned" class="type-micro text-warning rmap-section__title">
          <Icon name="lucide:circle-dashed" class="w-3.5 h-3.5" aria-hidden="true" />
          Unassigned · {{ model.unassigned.length }}
        </h2>
        <ul class="rmap-section__jobs">
          <li v-for="j in model.unassigned" :key="j.id" :data-flip-id="j.id" class="rmap-job ios-card" :class="jobClasses(j)">
            <!-- allow-raw-button: a job card's pick target; a toggle with aria-pressed, the card is its material -->
            <button type="button" class="rmap-job__pick" :aria-pressed="pickedJob === j.id" @click="pickJob(j.id)">
              <span class="rmap-job__title text-sm">{{ j.title }}</span>
              <span class="rmap-job__unassigned text-xs text-warning">
                Unassigned<template v-if="j.unassignedSince"> since {{ shortDay(j.unassignedSince) }}</template>
              </span>
              <span v-if="litJobs.has(j.id) && !pickedJob" class="sr-only">(lit)</span>
            </button>
            <div v-if="canOpen && pickedJob === j.id" class="rmap-job__open">
              <ActionButton icon="lucide:panel-right-open" @click="emit('open', j.id)">Open Job</ActionButton>
            </div>
          </li>
        </ul>
      </section>

      <template v-for="g in model.groups" :key="g.key">
        <section v-if="g.jobs.length" class="rmap-section" :aria-labelledby="`rmap-sec-${g.key}`">
          <!-- allow-heading-label: the section is in the outline (screen-reader heading jumps) and reads as a label -->
          <h2 :id="`rmap-sec-${g.key}`" class="type-micro t-text-muted rmap-section__title">{{ g.label }} · {{ g.jobs.length }}</h2>
          <ul class="rmap-section__jobs">
            <li v-for="j in g.jobs" :key="j.id" :data-flip-id="j.id" class="rmap-job ios-card" :class="jobClasses(j)">
              <!-- allow-raw-button: a job card's pick target; a toggle with aria-pressed, the card is its material -->
              <button type="button" class="rmap-job__pick" :aria-pressed="pickedJob === j.id" @click="pickJob(j.id)">
                <span class="rmap-job__title text-sm">{{ j.title }}</span>
                <TransitionGroup tag="span" name="rmap-chip" class="rmap-job__chips">
                  <span
                    v-for="h in j.holders"
                    :key="`${h.key}|${h.role}|${people(h)}`"
                    class="rmap-chip text-xs"
                    :class="{ 'rmap-chip--lit': pickedHolder === h.key, 'rmap-chip--vacant': h.vacant }"
                  >
                    <Icon :name="KIND_ICON[h.kind]" class="rmap-chip__icon" aria-hidden="true" />
                    <span>{{ h.name }}</span>
                    <span v-if="h.kind === 'office'" :class="h.vacant ? 'text-warning' : 't-text-muted'">
                      {{ h.vacant ? "(vacant)" : people(h) }}
                    </span>
                    <span v-if="h.role !== 'owner'" class="t-text-muted">· {{ roleLabel(h.role).toLowerCase() }}</span>
                  </span>
                </TransitionGroup>
                <span v-if="litJobs.has(j.id) && !pickedJob" class="sr-only">(lit)</span>
              </button>
              <div v-if="canOpen && pickedJob === j.id" class="rmap-job__open">
                <ActionButton icon="lucide:panel-right-open" @click="emit('open', j.id)">Open Job</ActionButton>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.rmap {
  display: grid;
  grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

/* ── The rail ─────────────────────────────────────────────────────────────── */
.rmap-rail {
  position: sticky;
  top: var(--data-table-group-top, 4rem);
  max-height: calc(100dvh - var(--data-table-group-top, 4rem) - 1.5rem);
  overflow-y: auto;
  padding: 0.75rem 0.5rem;
  border-radius: 1.25rem;
}
.rmap-rail__title {
  padding: 0 0.5rem 0.5rem;
}
.rmap-rail__group {
  padding: 0.625rem 0.5rem 0.25rem;
}
.rmap-rail__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rmap-holder {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 44px;
  width: 100%;
  padding: 0.375rem 0.625rem;
  border-radius: 0.875rem;
  text-align: left;
  color: var(--theme-text-primary);
  transition:
    background-color var(--motion-fast, 160ms) ease,
    opacity var(--motion-base, 240ms) ease;
}
.rmap-holder:hover {
  background: color-mix(in srgb, var(--theme-bg-secondary) 60%, transparent);
}
.rmap-holder:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}
.rmap-holder--checked,
.rmap-holder--lit {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
}
.rmap-holder--checked .rmap-holder__name {
  font-weight: 600;
}
.rmap--picking .rmap-holder:not(.rmap-holder--checked):not(.rmap-holder--lit) {
  opacity: 0.55;
}
.rmap-holder__icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--theme-text-muted);
}
.rmap-holder--attention .rmap-holder__icon {
  color: var(--warning);
}
.rmap-holder__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}
.rmap-holder__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rmap-holder__sub,
.rmap-holder__role {
  color: var(--theme-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rmap-holder__role {
  color: var(--primary);
  font-weight: 600;
}
.rmap-holder__count {
  color: var(--theme-text-secondary);
  min-width: 1.5rem;
  text-align: right;
}

/* ── The jobs ─────────────────────────────────────────────────────────────── */
.rmap-jobs {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-width: 0;
}
.rmap-jobs__summary {
  min-height: 1.25rem;
}
.rmap-section__title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}
.rmap-section__jobs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.5rem;
}
.rmap-job {
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  transition:
    opacity var(--motion-base, 240ms) ease,
    box-shadow var(--motion-base, 240ms) ease;
}
.rmap-job--attention {
  box-shadow: inset 3px 0 0 var(--warning);
}
.rmap--picking .rmap-job:not(.rmap-job--lit) {
  opacity: 0.4;
}
.rmap-job--lit {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 70%, transparent);
}
.rmap-job--changed {
  animation: rmap-pulse 1.2s var(--spring-out, ease-out);
}
@keyframes rmap-pulse {
  0% {
    background-color: color-mix(in srgb, var(--primary) 22%, var(--theme-card-bg));
  }
  100% {
    background-color: var(--theme-card-bg);
  }
}
.rmap-job__pick {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  width: 100%;
  min-height: 44px;
  padding: 0.75rem 0.875rem;
  border-radius: inherit;
  text-align: left;
  color: var(--theme-text-primary);
}
.rmap-job__pick:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}
.rmap-job__title {
  font-weight: 500;
}
.rmap-job__unassigned {
  font-weight: 500;
}
.rmap-job__open {
  padding: 0 0.75rem 0.75rem;
}
.rmap-job__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.rmap-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.0625rem 0.5rem 0.0625rem 0.375rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 80%, transparent);
  color: var(--theme-text-primary);
}
.rmap-chip--lit {
  background: color-mix(in srgb, var(--primary) 18%, transparent);
}
.rmap-chip--vacant {
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}
.rmap-chip__icon {
  width: 0.75rem;
  height: 0.75rem;
  color: var(--theme-text-muted);
}

/* A new holder's chip slides in where the old one was. */
.rmap-chip-enter-active {
  transition:
    transform var(--motion-page, 300ms) var(--spring-out, ease-out),
    opacity var(--motion-page, 300ms) ease;
}
.rmap-chip-enter-from {
  opacity: 0;
  transform: translateX(-0.5rem);
}

/* ── A phone: the sides stack, the rail scrolls sideways ──────────────────── */
@media (max-width: 767px) {
  .rmap {
    grid-template-columns: minmax(0, 1fr);
  }
  .rmap-rail {
    position: sticky;
    top: var(--data-table-group-top, 4rem);
    z-index: 2;
    max-height: none;
    overflow: visible;
    padding: 0.5rem;
  }
  .rmap-rail__title {
    padding-bottom: 0.375rem;
  }
  .rmap-rail__list {
    flex-direction: row;
    align-items: stretch;
    gap: 0.375rem;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }
  .rmap-rail__list::-webkit-scrollbar {
    display: none;
  }
  .rmap-rail__group {
    display: none;
  }
  .rmap-holder {
    width: auto;
    flex: 0 0 auto;
    max-width: 14rem;
    scroll-snap-align: start;
    background: color-mix(in srgb, var(--theme-bg-secondary) 45%, transparent);
  }
  .rmap-holder--attention {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--warning) 45%, transparent);
  }
  .rmap-section__jobs {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rmap-holder,
  .rmap-job {
    transition: none;
  }
  .rmap-job--changed {
    animation: none;
  }
  .rmap-chip-enter-active {
    transition: none;
  }
}
</style>
