<script setup lang="ts">
/**
 * A sheet that rises from the bottom edge.
 *
 * This is the app's create/edit surface, and one of the four navigation patterns
 * the workspace teaches: push/pop for drilling in, slide-over for inspecting a
 * row, segmented control for sibling views, and this for making or changing
 * something. Because the pattern is consistent, "a sheet came up" always means
 * "you are entering something, and dismissing loses it".
 *
 * Dismissal follows the entry path — you drag it back down the way it came —
 * which is what makes it feel attached to your finger rather than to a modal
 * system.
 *
 * MOTION NOTE: the drag is driven by inline style + a compositor transition, not
 * Vue's <Transition> classes and not a JS ticker. <Transition> swaps its enter
 * classes inside a requestAnimationFrame callback, which stalls in a background
 * tab and leaves the sheet parked half-open; every transition here therefore
 * also carries a setTimeout settle as a belt-and-braces fallback.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    description?: string;
    /** Lets the sheet grow to fit; capped so the page behind stays visible. */
    maxHeight?: string;
    /** Disables drag + backdrop dismissal for destructive/irreversible forms. */
    persistent?: boolean;
    /**
     * Stay a bottom sheet at every width. Only for surfaces that are genuinely
     * about reach (a quick action bar), not for forms.
     */
    alwaysSheet?: boolean;
  }>(),
  { maxHeight: "88vh", persistent: false, alwaysSheet: false },
);

const emit = defineEmits<{ "update:open": [value: boolean]; close: [] }>();

const haptic = useHaptic();

// A bottom sheet is a THUMB-REACH affordance: it rises to where your hand
// already is on a phone. On a large pointer-driven screen that reasoning does
// not apply, and a full-width slab pinned to the bottom edge just looks like a
// phone UI someone stretched — so above `md` the same content presents as a
// centered dialog. Deciding it here rather than at the call site means a page
// asks for "a surface to create or edit something in" and gets the right one
// for the viewport, instead of every page branching on width itself.
const isWide = ref(false);
let mq: MediaQueryList | null = null;
const onMq = (e: MediaQueryListEvent) => (isWide.value = e.matches);

onMounted(() => {
  if (!window.matchMedia) return;
  mq = window.matchMedia("(min-width: 768px)");
  isWide.value = mq.matches;
  mq.addEventListener("change", onMq);
});
onUnmounted(() => mq?.removeEventListener("change", onMq));

/** Sheet on phones, dialog on desktop. */
const asDialog = computed(() => isWide.value && !props.alwaysSheet);

const sheetEl = ref<HTMLElement | null>(null);
const dragY = ref(0);
const dragging = ref(false);

/** Past either of these on release, the sheet goes rather than springs back. */
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.5; // px per ms

let startY = 0;
let startTime = 0;
let lastY = 0;
let lastTime = 0;

function onPointerDown(e: PointerEvent) {
  if (props.persistent || asDialog.value) return;
  // Only the grabber starts a drag. If the whole sheet did, scrolling a long
  // form or dragging to select text inside it would dismiss the sheet.
  dragging.value = true;
  startY = lastY = e.clientY;
  startTime = lastTime = e.timeStamp;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  const delta = e.clientY - startY;
  // Downward tracks the finger 1:1; upward rubber-bands, so the sheet resists
  // being pulled past its open position instead of detaching from the edge.
  dragY.value = delta >= 0 ? delta : delta * 0.3;
  lastY = e.clientY;
  lastTime = e.timeStamp;
}

function onPointerUp() {
  if (!dragging.value) return;
  dragging.value = false;

  const elapsed = Math.max(1, lastTime - startTime);
  const velocity = (lastY - startY) / elapsed;

  if (dragY.value > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
    haptic.tap();
    // Carry the throw through instead of snapping back to 0 and replaying a
    // canned drop — the panel should keep travelling the way the finger sent it.
    dragDismissed.value = true;
    dragY.value = (sheetEl.value?.offsetHeight ?? 400) + 40;
    close();
  } else {
    haptic.detentSnap();
    dragY.value = 0;
  }
}

function close() {
  emit("update:open", false);
  emit("close");
}

function onBackdrop() {
  if (!props.persistent) close();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open && !props.persistent) close();
}

// ── Leaving ────────────────────────────────────────────────────────────────
// `open` going false cannot unmount the sheet immediately or it vanishes with no
// exit at all. `rendered` keeps it in the DOM until its leave animation has
// played. A setTimeout — not an animationend listener — does the unmounting,
// because animationend never fires in a background tab and the sheet would be
// stranded in the DOM, holding the backdrop over the page.
const LEAVE_MS = 220;
const rendered = ref(props.open);
const leaving = ref(false);
/** Dismissed by dragging: the panel already left with the finger. */
const dragDismissed = ref(false);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.open,
  (open) => {
    if (leaveTimer) clearTimeout(leaveTimer);
    if (open) {
      leaving.value = false;
      dragDismissed.value = false;
      // Reset the offset, or a sheet dismissed by a throw reopens already
      // pushed off-screen.
      dragY.value = 0;
      rendered.value = true;
      return;
    }
    if (!rendered.value) return;
    leaving.value = true;
    leaveTimer = setTimeout(() => {
      rendered.value = false;
      leaving.value = false;
      dragDismissed.value = false;
      dragY.value = 0;
    }, LEAVE_MS);
  },
);

onUnmounted(() => {
  if (leaveTimer) clearTimeout(leaveTimer);
});

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));

const sheetStyle = computed(() => ({
  transform: dragY.value ? `translate3d(0, ${dragY.value}px, 0)` : "",
  transition: dragging.value
    ? "none"
    : "transform 400ms var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1))",
  maxHeight: asDialog.value ? "min(85vh, 44rem)" : props.maxHeight,
}));

/** Backdrop fades out as the sheet is dragged away. */
const backdropStyle = computed(() => ({
  opacity: dragging.value ? Math.max(0, 1 - dragY.value / 300) : undefined,
}));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="rendered"
      class="sheet"
      :class="{
        'sheet--dialog': asDialog,
        'sheet--leaving': leaving,
        'sheet--dragged-out': dragDismissed,
      }"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div
        class="sheet__backdrop dialog-overlay-glass"
        :style="backdropStyle"
        @click="onBackdrop"
      />

      <div ref="sheetEl" class="sheet__panel glass-surface glass-surface--strong" :style="sheetStyle">
        <!-- Grabber: the only drag handle, and the visual promise that this
             thing can be pulled down. Meaningless with a pointer, so the dialog
             presentation gets a close button instead. -->
        <div
          v-if="!persistent && !asDialog"
          class="sheet__grabber-hit"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <span class="sheet__grabber" :class="{ 'sheet__grabber--active': dragging }" />
        </div>

        <button
          v-if="!persistent && asDialog"
          type="button"
          class="sheet__close"
          aria-label="Close"
          @click="close"
        >
          <Icon name="lucide:x" class="size-4" />
        </button>

        <header v-if="title || $slots.header" class="sheet__header">
          <slot name="header">
            <h2 class="type-section type-flush">{{ title }}</h2>
            <p v-if="description" class="type-meta">{{ description }}</p>
          </slot>
        </header>

        <div class="sheet__body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="sheet__footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.sheet__backdrop {
  position: absolute;
  inset: 0;
  animation: sheet-fade 240ms ease both;
}
.sheet__panel {
  position: relative;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  /* Rounded at the top only — the sheet is attached to the bottom edge. */
  border-radius: 1rem 1rem 0 0;
  animation: sheet-rise 400ms var(--spring-out, cubic-bezier(0.32, 0.72, 0, 1)) both;
  padding-bottom: env(safe-area-inset-bottom, 0);
  overflow: hidden;
}

.sheet__grabber-hit {
  padding: 0.625rem 0 0.375rem;
  display: flex;
  justify-content: center;
  cursor: grab;
  /* The browser must not claim the vertical gesture for scrolling. */
  touch-action: none;
}
.sheet__grabber-hit:active {
  cursor: grabbing;
}
.sheet__grabber {
  width: 40px;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-text-muted) 50%, transparent);
  transition: background var(--motion-fast, 160ms) ease;
}
.sheet__grabber--active {
  background: hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l));
}

.sheet__header {
  padding: 0.25rem 1.25rem 0.75rem;
}
.sheet__body {
  padding: 0 1.25rem 1.25rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sheet__footer {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid var(--theme-border-light);
}

/* ---- Dialog presentation (>= md) ---------------------------------------- */
.sheet--dialog {
  justify-content: center;
  align-items: center;
  padding: 1.5rem;
}
.sheet--dialog .sheet__panel {
  max-width: 32rem;
  /* Concentric all the way round, since it is no longer attached to an edge. */
  border-radius: 1rem;
  /* Scale-and-fade from the center reads as "this belongs to the page you are
     on", where a rise from the bottom edge would imply a direction it did not
     come from. */
  animation: dialog-pop 240ms var(--spring-out, cubic-bezier(0.32, 0.72, 0, 1)) both;
}
.sheet--dialog .sheet__header {
  padding-top: 1.25rem;
  padding-inline-end: 3rem;
}
.sheet__close {
  position: absolute;
  top: 0.875rem;
  right: 0.875rem;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  color: var(--theme-text-muted);
  transition: background var(--motion-fast, 160ms) ease, color var(--motion-fast, 160ms) ease;
}
.sheet__close:hover {
  background: color-mix(in srgb, var(--theme-bg-secondary) 80%, transparent);
  color: var(--theme-text-primary);
}

@keyframes dialog-pop {
  from { opacity: 0; transform: translate3d(0, 8px, 0) scale(0.97); }
  to   { opacity: 1; transform: none; }
}

/* ---- Leaving ------------------------------------------------------------
   Dismissal reverses the way the thing arrived: a sheet drops back to the edge
   it rose from, a dialog shrinks back toward the page. Leaves are quicker than
   enters — you have already decided to go, and waiting on an exit is the part
   that feels sluggish. */
/* Each exit gets its OWN keyframes rather than replaying the entrance with
   `reverse`. Re-declaring the same animation-name on an element whose animation
   has already finished does not restart it — the browser just updates the
   existing, completed animation — so the panel snapped straight to its end state
   and appeared to vanish with no transition at all. */
.sheet--leaving .sheet__backdrop {
  animation: sheet-fade-out 180ms ease both;
}
.sheet--leaving .sheet__panel {
  animation: sheet-drop 220ms cubic-bezier(0.4, 0, 1, 1) both;
}
.sheet--dialog.sheet--leaving .sheet__panel {
  animation: dialog-pop-out 180ms ease-in both;
}

@keyframes sheet-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes dialog-pop-out {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: translate3d(0, 6px, 0) scale(0.97); }
}
/* Thrown out by hand: the inline transform is already carrying it off-screen on
   the spring, so a keyframe here would fight it and snap. */
.sheet--dragged-out .sheet__panel {
  animation: none;
}

@keyframes sheet-drop {
  from { transform: none; }
  to   { transform: translate3d(0, 100%, 0); }
}

@keyframes sheet-rise {
  from { transform: translate3d(0, 100%, 0); }
  to   { transform: none; }
}
@keyframes sheet-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .sheet__panel,
  .sheet--dialog .sheet__panel {
    animation: sheet-fade 160ms ease both;
  }
  .sheet--leaving .sheet__panel,
  .sheet--dialog.sheet--leaving .sheet__panel {
    animation: sheet-fade-out 140ms ease both;
  }
}
</style>
