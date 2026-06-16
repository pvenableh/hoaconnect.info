<!--
  AppSlideOverStack — single mount-point that renders the global slide-over
  stack with iOS push/pop visuals. Ported from Earnest (P3.5 rewrite).

  Up to 2 panels render at once. Each panel's component is looked up from
  `components/panels/registry.ts` by type string and gets `{ id }` as a
  prop. Position + dim + slide animation live on the stack; chrome (header
  with close/back, body, optional footer) lives inside each panel via
  `<AppSlideOverShell>`.

  Mounted once from `app/layouts/auth.vue` — never per-page.

  Visual spec (Framework7's iOS curve):
    - Spring `var(--spring)` at 400 ms.
    - Incoming panel:  translateX(100%) → 0.
    - Outgoing panel:  translateX(0)    → 100%.
    - Behind panel:    translateX(0) → -20%, scale 0.96, opacity 0.6.
    - Single shared backdrop, deeper dim at depth 2.

  Motion stack — compositor + reactive inline-style: enter/leave is driven
  by `{ visible, leaving }` flags building inline styles, NOT Vue
  <Transition> (whose RAF class-swap stalls in HMR/throttled environments
  and strands panels mid-flight). Timers are setTimeout, not RAF.

  Focus + a11y:
    - reka-ui <FocusScope> traps focus on the top panel (suspended while a
      teleported modal is open above — see useSlideOverFocusTrapSuspend).
    - aria-modal + role=dialog on the top panel only.
    - Body scroll lock while the stack has depth; Escape/backdrop → pop().
-->
<script setup lang="ts">
import { FocusScope } from "reka-ui";
import { useScrollLock } from "@vueuse/core";
import type { FlipFromPayload } from "~/composables/useFlipFromRow";
import { getPanelComponent } from "~/components/panels/registry";

// This component is the stack's single owner: it also runs the URL → stack
// reconciliation so layouts only need to mount it.
useAppSlideOverStackUrlSync();

const { stack, depth, pop } = useAppSlideOverStack();
const flips = useSlideOverFlips();
const { count: trapSuspend } = useSlideOverFocusTrapSuspend();

const SPRING_EASE_FN = "var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1))";
const ANIM_MS = 400;
// One macrotask after mount, then flip `visible` so the closed pose paints
// first and the CSS transition has something to interpolate from.
const SETTLE_MS = 16;

type PanelComponent = NonNullable<ReturnType<typeof getPanelComponent>>;

type RenderedPanel = {
  key: string;
  type: string;
  id: string;
  mode?: string;
  component: PanelComponent;
  visible: boolean;
  leaving: boolean;
  /** One-shot FLIP source consumed when this panel enters the rendered list. */
  flipFrom: FlipFromPayload | null;
};

const rendered = ref<RenderedPanel[]>([]);
const enterTimers = new Map<string, ReturnType<typeof setTimeout>>();
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function panelKey(p: { type: string; id: string }): string {
  return `${p.type}:${p.id}`;
}

function syncRendered() {
  const next = stack.value
    .slice(0, 2)
    .map((p) => {
      const component = getPanelComponent(p.type);
      return component
        ? { type: p.type, id: p.id, mode: p.mode, component, key: panelKey(p) }
        : null;
    })
    .filter(
      (p): p is { type: string; id: string; mode: string | undefined; component: PanelComponent; key: string } =>
        p !== null
    );

  const nextKeys = new Set(next.map((p) => p.key));

  // Panels that disappeared from the stack → mark leaving + schedule unmount
  // once their slide-out finishes.
  for (let i = 0; i < rendered.value.length; i++) {
    const r = rendered.value[i]!;
    if (!nextKeys.has(r.key) && !r.leaving) {
      const et = enterTimers.get(r.key);
      if (et) {
        clearTimeout(et);
        enterTimers.delete(r.key);
      }
      r.leaving = true;
      r.visible = false;
      const t = setTimeout(() => {
        rendered.value = rendered.value.filter((x) => x.key !== r.key);
        leaveTimers.delete(r.key);
      }, ANIM_MS + 32);
      leaveTimers.set(r.key, t);
    }
  }

  // New panels mount at the closed (off-screen-right) pose, then flip
  // `visible` on the next macrotask. FLIP-bound entries mount at the open
  // pose directly; the shell FLIPs the row clone into the #hero slot.
  for (const n of next) {
    const existing = rendered.value.find((r) => r.key === n.key);
    if (!existing) {
      const flipFrom = flips.value[n.key] ?? null;
      if (flipFrom) {
        // Consume — re-mounts (URL replay, back-nav) won't FLIP again.
        const { [n.key]: _drop, ...rest } = flips.value;
        flips.value = rest;
      }
      rendered.value.push({
        key: n.key,
        type: n.type,
        id: n.id,
        mode: n.mode,
        component: n.component,
        visible: !!flipFrom,
        leaving: false,
        flipFrom,
      });
      if (!flipFrom) {
        const t = setTimeout(() => {
          const found = rendered.value.find((r) => r.key === n.key);
          if (found) found.visible = true;
          enterTimers.delete(n.key);
        }, SETTLE_MS);
        enterTimers.set(n.key, t);
      }
    } else if (existing.leaving) {
      // Resurrected before the unmount timer fired — cancel leave.
      const lt = leaveTimers.get(n.key);
      if (lt) {
        clearTimeout(lt);
        leaveTimers.delete(n.key);
      }
      existing.leaving = false;
      existing.visible = true;
    }
  }

  // Reorder so non-leaving entries follow the stack order; leaving entries
  // hang at the end with z-index 3 so they paint over the settled top.
  const settledOrdered = next
    .map((n) => rendered.value.find((r) => r.key === n.key))
    .filter((r): r is RenderedPanel => !!r);
  const leaving = rendered.value.filter((r) => r.leaving);
  rendered.value = [...settledOrdered, ...leaving];
}

// Fire for id/mode/length changes, not unrelated query churn.
watch(
  () => stack.value.map((p) => `${p.type}:${p.id}:${p.mode ?? ""}`).join("/"),
  () => syncRendered(),
  { immediate: true }
);

const renderable = computed(() => {
  const settled = rendered.value.filter((r) => !r.leaving);
  const settledKeys = settled.map((r) => r.key);
  const topKey = settledKeys[settledKeys.length - 1];
  return rendered.value.map((r) => {
    const isTop = r.key === topKey && !r.leaving;
    const inSettled = settledKeys.includes(r.key);
    let pose: Record<string, string | number>;
    if (!r.visible) {
      pose = {
        transform: "translate3d(100%, 0, 0)",
        opacity: 1,
        boxShadow: "-12px 0 24px -8px rgb(0 0 0 / 0.18)",
        zIndex: 3,
      };
    } else if (isTop) {
      pose = {
        transform: "translate3d(0, 0, 0)",
        opacity: 1,
        boxShadow: "-12px 0 24px -8px rgb(0 0 0 / 0.18)",
        zIndex: 2,
      };
    } else if (inSettled) {
      pose = {
        transform: "translate3d(-20%, 0, 0) scale(0.96)",
        opacity: 0.6,
        boxShadow: "-12px 0 24px -8px rgb(0 0 0 / 0.12)",
        zIndex: 1,
      };
    } else {
      pose = {
        transform: "translate3d(100%, 0, 0)",
        opacity: 1,
        boxShadow: "-12px 0 24px -8px rgb(0 0 0 / 0.18)",
        zIndex: 3,
      };
    }
    return {
      key: r.key,
      type: r.type,
      id: r.id,
      mode: r.mode,
      component: r.component,
      flipFrom: r.flipFrom,
      isTop,
      style: {
        ...pose,
        transition: `transform ${ANIM_MS}ms ${SPRING_EASE_FN}, opacity ${ANIM_MS}ms ${SPRING_EASE_FN}, box-shadow ${ANIM_MS}ms ${SPRING_EASE_FN}`,
      },
    };
  });
});

// Backdrop — same mounted/visible pair as the panels so fade-out has a
// starting frame.
const backdropMounted = ref(false);
const backdropVisible = ref(false);
let backdropLeaveTimer: ReturnType<typeof setTimeout> | null = null;
let backdropEnterTimer: ReturnType<typeof setTimeout> | null = null;

const settledDepth = computed(() => rendered.value.filter((r) => !r.leaving).length);

watch(
  settledDepth,
  (d) => {
    if (d > 0) {
      if (backdropLeaveTimer) {
        clearTimeout(backdropLeaveTimer);
        backdropLeaveTimer = null;
      }
      backdropMounted.value = true;
      if (backdropEnterTimer) clearTimeout(backdropEnterTimer);
      backdropEnterTimer = setTimeout(() => {
        backdropVisible.value = true;
        backdropEnterTimer = null;
      }, SETTLE_MS);
    } else if (backdropMounted.value) {
      if (backdropEnterTimer) {
        clearTimeout(backdropEnterTimer);
        backdropEnterTimer = null;
      }
      backdropVisible.value = false;
      backdropLeaveTimer = setTimeout(() => {
        backdropMounted.value = false;
        backdropLeaveTimer = null;
      }, ANIM_MS + 32);
    }
  },
  { immediate: true }
);

const backdropStyle = computed(() => ({
  opacity: backdropVisible.value ? 1 : 0,
  background: settledDepth.value >= 2 ? "rgb(0 0 0 / 0.5)" : "rgb(0 0 0 / 0.35)",
  transition: `opacity ${ANIM_MS}ms ${SPRING_EASE_FN}, background ${ANIM_MS}ms ${SPRING_EASE_FN}`,
}));

// Body scroll lock bound to the URL-driven depth (not rendered depth) so it
// releases the moment the user pops, not after the slide-out.
const scrollLocked = import.meta.client ? useScrollLock(document.body) : ref(false);
watchEffect(() => {
  scrollLocked.value = depth.value > 0;
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && depth.value > 0) {
    event.preventDefault();
    pop();
  }
}

onMounted(() => {
  if (!import.meta.client) return;
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  if (!import.meta.client) return;
  window.removeEventListener("keydown", onKeydown);
  for (const t of enterTimers.values()) clearTimeout(t);
  for (const t of leaveTimers.values()) clearTimeout(t);
  if (backdropLeaveTimer) clearTimeout(backdropLeaveTimer);
  if (backdropEnterTimer) clearTimeout(backdropEnterTimer);
});
</script>

<template>
  <Teleport to="body">
    <div
      class="app-slide-over-stack"
      :data-depth="depth"
      :aria-hidden="depth === 0 ? 'true' : null"
    >
      <!-- Shared backdrop. One element; opacity bumps with depth so a second
           push deepens the dim instead of stacking layers. -->
      <div
        v-if="backdropMounted"
        class="app-slide-over-stack__backdrop"
        :style="backdropStyle"
        @click="pop()"
      />

      <!-- Panel layer. Full visual pose rides on inline style; the CSS class
           only declares position + base styling. No Vue <Transition>. -->
      <div class="app-slide-over-stack__panels">
        <div
          v-for="panel in renderable"
          :key="panel.key"
          class="app-slide-over-stack__panel"
          :style="panel.style"
          :role="panel.isTop ? 'dialog' : undefined"
          :aria-modal="panel.isTop ? 'true' : undefined"
        >
          <FocusScope :trapped="panel.isTop && trapSuspend === 0" :loop="true" as-child>
            <div class="app-slide-over-stack__panel-inner">
              <component
                :is="panel.component"
                :id="panel.id"
                :mode="panel.mode"
                :flip-from="panel.flipFrom"
                @close="pop()"
              />
            </div>
          </FocusScope>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-slide-over-stack {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}

/* Stays mounted at depth 0 so a leaving panel can finish its translate-out.
 * pointer-events on the wrapper is `none` (panels + backdrop re-enable
 * themselves), so the page underneath stays interactive. */

.app-slide-over-stack__backdrop {
  position: absolute;
  inset: 0;
  /* Accent-tinted blurred backdrop — radial wash toward the panel side +
   * blur over the page beneath, so the app reads as "behind glass" when a
   * slide-over is open instead of just dimmed-out. Accent comes from the
   * earnest-ui.css --app-accent-* system. */
  background:
    radial-gradient(
      ellipse 60% 80% at 80% 50%,
      hsl(var(--app-accent-h, 220) 50% 30% / 0.28) 0%,
      transparent 80%
    ),
    rgb(0 0 0 / 0.35);
  backdrop-filter: blur(6px) saturate(140%);
  -webkit-backdrop-filter: blur(6px) saturate(140%);
  pointer-events: auto;
  opacity: 0;
}
.dark .app-slide-over-stack__backdrop {
  background:
    radial-gradient(
      ellipse 60% 80% at 80% 50%,
      hsl(var(--app-accent-h, 220) 50% 50% / 0.2) 0%,
      transparent 80%
    ),
    rgb(0 0 0 / 0.55);
}
@media (prefers-reduced-transparency: reduce) {
  .app-slide-over-stack__backdrop {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: rgb(0 0 0 / 0.5);
  }
}

.app-slide-over-stack__panels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.app-slide-over-stack__panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: 100vw;
  background: var(--background);
  pointer-events: auto;
  will-change: transform, opacity;
  /* Closed pose — overridden by the reactive inline transform on every
   * render. Safety net during SSR / hydration. */
  transform: translate3d(100%, 0, 0);
}

.app-slide-over-stack__panel-inner {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Desktop: right-anchored sheet at max-w-2xl. Mobile: full width so the
 * push feels like iOS view navigation. */
@media (min-width: 640px) {
  .app-slide-over-stack__panel {
    max-width: 42rem;
  }

  /* Fullscreen shell host — the surface inside owns its chrome and would be
   * crushed by the 42rem column. The shell sets `data-fullscreen`; lift the
   * cap via :has() so the panel spreads to the viewport. */
  .app-slide-over-stack__panel:has(
      > .app-slide-over-stack__panel-inner .app-slide-over-shell[data-fullscreen]
    ) {
    max-width: 100vw;
  }
}
</style>
