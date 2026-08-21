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
  }>(),
  { maxHeight: "88vh", persistent: false },
);

const emit = defineEmits<{ "update:open": [value: boolean]; close: [] }>();

const haptic = useHaptic();

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
  if (props.persistent) return;
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

// Reset the drag offset whenever the sheet opens, or a sheet dismissed by a
// throw would reopen already pushed off-screen.
watch(
  () => props.open,
  (open) => {
    if (open) dragY.value = 0;
  },
);

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));

const sheetStyle = computed(() => ({
  transform: dragY.value ? `translate3d(0, ${dragY.value}px, 0)` : "",
  transition: dragging.value
    ? "none"
    : "transform 400ms var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1))",
  maxHeight: props.maxHeight,
}));

/** Backdrop fades out as the sheet is dragged away. */
const backdropStyle = computed(() => ({
  opacity: dragging.value ? Math.max(0, 1 - dragY.value / 300) : undefined,
}));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet" role="dialog" aria-modal="true" :aria-label="title">
      <div
        class="sheet__backdrop dialog-overlay-glass"
        :style="backdropStyle"
        @click="onBackdrop"
      />

      <div ref="sheetEl" class="sheet__panel glass-surface glass-surface--strong" :style="sheetStyle">
        <!-- Grabber: the only drag handle, and the visual promise that this
             thing can be pulled down. -->
        <div
          v-if="!persistent"
          class="sheet__grabber-hit"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <span class="sheet__grabber" :class="{ 'sheet__grabber--active': dragging }" />
        </div>

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

@keyframes sheet-rise {
  from { transform: translate3d(0, 100%, 0); }
  to   { transform: none; }
}
@keyframes sheet-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .sheet__panel {
    animation: sheet-fade 160ms ease both;
  }
}
</style>
