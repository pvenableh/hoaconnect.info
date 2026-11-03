<script setup lang="ts">
/**
 * AppHeaderOutlet — the workspace's ONE page title (Earnest's AppHeaderOutlet).
 *
 * Mounted once by layouts/auth.vue, above `<main>` and outside `<slot />`, so it
 * survives every route change. `<AppPageHeader>` (in the page) only registers
 * the title into usePageTitle and teleports its `#actions` / `#meta` here.
 *
 * ── Why the text swaps by CLASS and not by <Transition> ──────────────────
 * `mode="out-in"` on a keyed `<h1>` would take the heading out of the DOM for
 * the length of the leave — the blurb under it would jump up into its place,
 * and the Nav's collapse measurement would lose its target mid-scroll. So the
 * nodes stay mounted and only their text and a phase class change: out short
 * and upward on the exit curve, in from below on the spring (the motion
 * module's tokens; reduced motion swaps instantly).
 *
 * ── Three states ─────────────────────────────────────────────────────────
 *   shown      the large title, eyebrow and blurb, on the page's column.
 *   collapsed  scrolled under the chrome: the Nav's centre carries a compact
 *              copy and grows its hairline. This block keeps its box (it is
 *              already off-screen; removing it would yank the page) and fades.
 *   hidden     no page registered a title: `display: none`, but the teleport
 *              targets stay in the DOM so a page can still reach them.
 *
 * Everything state-dependent waits for mount — see the SSR note in
 * usePageTitle. The DOM structure does not: `#app-header-actions` and
 * `#app-header-meta` must exist when a page's Teleport reaches for them.
 */
import { DURATION, prefersReducedMotion } from "#core/shared/motion";

const { pageTitle, collapsed, hasOutlet, visible, watchForStaleTitle } = usePageTitle();
const stopStaleWatch = watchForStaleTitle();

// Tell AppPageHeader a shell is listening, so it registers instead of rendering
// itself inline. For the lifetime of the shell.
hasOutlet.value = true;
onBeforeUnmount(() => {
  hasOutlet.value = false;
  stopStaleWatch();
});

// Matches PageContainer's width (published by it on mount) so the title sits
// on the same column as the content under it — as the SubNav already does.
const { pageWide } = usePageWidth();

const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

/* ── The animated text ──────────────────────────────────────────────────
 * `shown*` lags the registered value by one out-then-in beat. */
const shownTitle = ref(pageTitle.value.title);
const shownBlurb = ref(pageTitle.value.blurb);
const shownKicker = ref(pageTitle.value.kicker);
const phase = ref<"idle" | "out" | "in">("idle");
let timers: ReturnType<typeof setTimeout>[] = [];

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function assign() {
  shownTitle.value = pageTitle.value.title;
  shownBlurb.value = pageTitle.value.blurb;
  shownKicker.value = pageTitle.value.kicker;
}

watch(
  () => [pageTitle.value.title, pageTitle.value.blurb, pageTitle.value.kicker, visible.value],
  () => {
    clearTimers();
    // Nothing to animate between: first paint, no title, or less motion asked for.
    if (!import.meta.client || prefersReducedMotion() || !shownTitle.value || !visible.value) {
      assign();
      phase.value = "idle";
      return;
    }
    if (
      pageTitle.value.title === shownTitle.value &&
      pageTitle.value.blurb === shownBlurb.value &&
      pageTitle.value.kicker === shownKicker.value
    ) {
      return;
    }
    phase.value = "out";
    timers.push(
      setTimeout(() => {
        assign();
        phase.value = "in";
        timers.push(setTimeout(() => (phase.value = "idle"), DURATION.panel));
      }, DURATION.fast)
    );
  },
  { immediate: true }
);
onBeforeUnmount(clearTimers);

const phaseClass = computed(() => `is-${phase.value}`);
</script>

<template>
  <div
    id="app-header-outlet"
    class="page-title mx-auto w-full px-4 sm:px-6"
    :class="[
      pageWide ? 'max-w-7xl' : 'max-w-6xl',
      {
        'page-title--hidden': !mounted || !visible,
        'page-title--collapsed': mounted && collapsed,
      },
    ]"
    data-page-title-outlet
  >
    <NuxtLink
      v-if="mounted && pageTitle.backTo"
      :to="pageTitle.backTo"
      class="page-title__back type-meta"
    >
      <Icon name="lucide:chevron-left" class="size-3.5" />
      {{ pageTitle.backLabel || "Back" }}
    </NuxtLink>

    <div class="page-title__row">
      <div class="page-title__text">
        <p v-if="mounted && shownKicker" class="type-micro page-title__kicker" :class="phaseClass">
          {{ shownKicker }}
        </p>
        <h1 class="type-display" :class="phaseClass" data-page-title-heading>
          {{ mounted ? shownTitle : "" }}
        </h1>
        <p v-if="mounted && shownBlurb" class="type-body page-title__blurb" :class="phaseClass">
          {{ shownBlurb }}
        </p>
        <!-- A page's #meta slot teleports in here. -->
        <div id="app-header-meta" class="page-title__meta" />
      </div>

      <!-- A page's #actions slot teleports in here. Rendered unconditionally so
           the target exists before any page reaches for it. -->
      <div id="app-header-actions" class="page-title__actions" />
    </div>
  </div>
</template>

<style scoped>
/* The same box AppPageHeader draws inline inside PageContainer — 1.5rem above
   the title (the container's own top padding); the container under the outlet
   supplies the 1.5rem below — so the hand-off on a cold load does not move it. */
.page-title {
  padding-top: 1.5rem;
  transition:
    opacity var(--motion-base, 240ms) var(--spring),
    transform var(--motion-panel, 460ms) var(--spring);
  transform-origin: left top;
}
.page-title--hidden {
  display: none;
}
/* Scrolled under the chrome: the Nav carries the title now. The block keeps
   its box and only fades. */
.page-title--collapsed {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
  pointer-events: none;
}

.page-title__back {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  padding-inline-start: var(--surface-inset, 1.25rem);
  color: var(--theme-text-muted);
  transition: color var(--motion-fast, 160ms) ease;
}
.page-title__back:hover {
  color: var(--theme-text-primary);
}
.page-title__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}
.page-title__text {
  min-width: 0;
}
.page-title__kicker {
  padding-inline-start: var(--surface-inset, 1.25rem);
  margin-bottom: 0.25rem;
}
.page-title__blurb {
  /* `type-display` carries the inset; the line under it has to match it or the
     text column visibly steps in and out. */
  padding-inline-start: var(--surface-inset, 1.25rem);
  margin-top: 0.25rem;
  max-width: 60ch;
}
.page-title__meta:empty,
.page-title__actions:empty {
  display: none;
}
.page-title__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

/* The swap. Out is short, upward and accelerating (the exit curve); in is
   longer, from below, on the spring — the same curve the page slide and the
   SubNav thumb run, so a title change reads as part of one motion. */
.is-out {
  opacity: 0;
  transform: translateY(-6px);
  transition:
    opacity var(--motion-fast, 160ms) var(--ease-exit),
    transform var(--motion-fast, 160ms) var(--ease-exit);
}
.is-in {
  animation: page-title-in var(--motion-panel, 460ms) var(--spring);
}
@keyframes page-title-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-title,
  .is-out {
    transition: none;
  }
  .is-in {
    animation: none;
  }
  .page-title--collapsed {
    transform: none;
  }
}
</style>
