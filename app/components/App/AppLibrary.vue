<!--
  AppLibrary — the apps, below md (Earnest's apps launcher / iPadOS App Library).

  A phone has no room for a row of nine chips, so below md the dock is gone
  (Dock.vue) and the Nav's grid button opens this: the dock's own apps — same
  order, accents, badges and active app, from useDockApps — as a four-column
  grid dropped from the bar.

  Not a modal: no focus trap, no scrim. Esc, a tap outside, a route change
  (tapping an app) close it; Esc and a route change hand focus back to the
  button. Overlay policy (core/shared/motion): it mounts in its closed pose and
  opens after the first frame, no <Transition>. The chips follow the panel in a
  28ms stagger (`apps-chip-in`, earnest-ui.css) while it opens; it leaves
  faster than it came, all at once. Reduced motion: no scale, no stagger.

  `preview` renders the grid alone, inline and inert — the /ui-kit specimen.
-->
<script setup lang="ts">
import { afterFirstFrame, DURATION } from "#core/shared/motion";
import type { AppDef } from "#core/app/composables/useAppNav";

const props = defineProps<{ preview?: boolean }>();

const route = useRoute();
const { glassChrome } = useAppNav();
const { apps, accents, activeKey, badges, totalUnread, accentVars, go } = useDockApps();

const panelId = useId();
const button = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);

// rendered: in the DOM. open: in its open pose. entering: the stagger is on.
const rendered = ref(false);
const open = ref(false);
const entering = ref(false);
const top = ref(0);
let cancelFrame: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const clearTimer = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};

function show() {
  if (props.preview || rendered.value) return;
  clearTimer();
  // Hang from the bar wherever it is (a banner can push it down).
  const bar = document.querySelector<HTMLElement>("[data-app-nav]");
  top.value = (bar?.getBoundingClientRect().bottom ?? 64) + 8;
  rendered.value = true;
  entering.value = true;
  cancelFrame = afterFirstFrame(() => {
    open.value = true;
  });
  // The last chip lands at (n-1)·28ms + its own 320ms; drop the class after,
  // so nothing is left parked on the keyframe's from-frame.
  timer = setTimeout(() => (entering.value = false), apps.value.length * 28 + 360);
}

function hide(opts?: { focus?: boolean }) {
  if (!rendered.value) return;
  cancelFrame?.();
  clearTimer();
  open.value = false;
  entering.value = false;
  timer = setTimeout(() => (rendered.value = false), DURATION.fast);
  if (opts?.focus) nextTick(() => button.value?.focus());
}

const toggle = () => (rendered.value && open.value ? hide() : show());

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !rendered.value) return;
  e.stopPropagation();
  hide({ focus: true });
}
function onPointerDown(e: PointerEvent) {
  if (!rendered.value || !(e.target instanceof Node)) return;
  if (panel.value?.contains(e.target) || button.value?.contains(e.target)) return;
  hide();
}

watch(rendered, (on) => {
  if (!import.meta.client || props.preview) return;
  if (on) {
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
  } else {
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
  }
});

// Tapping an app navigates; the panel goes with the page it was opened on.
watch(
  () => route.path,
  () => {
    const hadFocus = !!panel.value?.contains(document.activeElement);
    hide({ focus: hadFocus });
  }
);

onBeforeUnmount(() => {
  cancelFrame?.();
  clearTimer();
  if (import.meta.client) {
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
  }
});

const onPick = (app: AppDef) => {
  if (props.preview) return;
  go(app);
};

const label = computed(() => (totalUnread.value > 0 ? `Apps — ${totalUnread.value} unread` : "Apps"));
</script>

<template>
  <!-- The specimen: the grid alone, inline. -->
  <nav v-if="preview" class="app-library app-library--preview glass-surface glass-surface--strong" aria-label="Apps">
    <ul class="app-library__grid is-entering">
      <li v-for="(app, i) in apps" :key="app.key" class="app-library__item" :style="{ '--i': i }">
        <button
          type="button"
          class="app-library__app"
          :class="{ 'app-library__app--active': app.key === activeKey, 'app-library__app--solid': !glassChrome }"
          :style="accentVars(accents[i])"
          @click="onPick(app)"
        >
          <span class="app-library__chip">
            <Icon :name="'i-lucide-' + app.icon" class="app-library__icon" />
          </span>
          <span class="app-library__label">{{ app.shortName }}</span>
        </button>
      </li>
    </ul>
  </nav>

  <template v-else>
    <button
      ref="button"
      type="button"
      class="header-pill inline-flex items-center justify-center relative"
      :class="{ 'is-active': open }"
      :aria-expanded="open"
      :aria-controls="panelId"
      :aria-label="label"
      title="Apps"
      data-app-library-trigger
      @click="toggle"
    >
      <Icon name="i-lucide-layout-grid" class="w-4 h-4 app-library__glyph" :class="{ 'is-open': open }" />
      <span v-if="totalUnread > 0 && !open" class="app-library__dot" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <nav
        v-if="rendered"
        :id="panelId"
        ref="panel"
        class="app-library ui-kit glass-surface glass-surface--strong"
        :class="{ 'is-open': open }"
        :style="{ top: `${top}px` }"
        aria-label="Apps"
        data-app-library
      >
        <ul class="app-library__grid" :class="{ 'is-entering': entering }">
          <li v-for="(app, i) in apps" :key="app.key" class="app-library__item" :style="{ '--i': i }">
            <button
              type="button"
              class="app-library__app"
              :class="{ 'app-library__app--active': app.key === activeKey, 'app-library__app--solid': !glassChrome }"
              :style="accentVars(accents[i])"
              :aria-current="app.key === activeKey ? 'page' : undefined"
              :data-app-library-app="app.key"
              @click="onPick(app)"
            >
              <span class="app-library__chip">
                <Icon :name="'i-lucide-' + app.icon" class="app-library__icon" />
                <span v-if="badges[app.key]" class="app-library__badge">
                  {{ badges[app.key]! > 9 ? "9+" : badges[app.key] }}
                </span>
              </span>
              <span class="app-library__label">{{ app.shortName }}</span>
            </button>
          </li>
        </ul>
      </nav>
    </Teleport>
  </template>
</template>

<style scoped>
/* The grid glyph turns a quarter as the panel opens, and back. */
.app-library__glyph {
  transition: transform var(--motion-base, 240ms) var(--spring);
}
.app-library__glyph.is-open {
  transform: rotate(90deg);
}
.app-library__dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--theme-accent-primary);
  box-shadow: 0 0 0 2px var(--theme-bg-elevated);
  pointer-events: none;
}

/* Hangs from the bar, phone-wide, capped so a tablet-width bar does not
   scatter four columns across it. */
.app-library {
  position: fixed;
  left: 0.75rem;
  right: 0.75rem;
  z-index: 50;
  max-width: 26rem;
  padding: 10px 8px;
  border-radius: 1.5rem;
  transform-origin: top left;
  opacity: 0;
  transform: scale(0.94) translateY(-6px);
  /* Leaving: quicker than arriving, accelerating, no stagger. */
  transition:
    opacity var(--motion-fast, 160ms) var(--ease-exit),
    transform var(--motion-fast, 160ms) var(--ease-exit);
}
.app-library.is-open {
  opacity: 1;
  transform: none;
  transition:
    opacity var(--motion-panel, 460ms) var(--spring),
    transform var(--motion-panel, 460ms) var(--spring);
}
.app-library--preview {
  position: static;
  opacity: 1;
  transform: none;
  max-width: 22rem;
}

.app-library__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  row-gap: 12px;
  column-gap: 4px;
  margin: 0;
  padding: 4px;
  list-style: none;
}

/* App Library stagger: each chip scales up from 0.6 on a small overshoot, in
   grid order. On the ITEM, never the chip — the chip owns its own transform.
   `backwards` holds the from-frame through the delay. */
.app-library__grid.is-entering .app-library__item {
  animation: apps-chip-in 320ms var(--spring-bounce) backwards;
  animation-delay: calc(var(--i, 0) * 28ms);
}

.app-library__app {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px 2px;
  border-radius: 14px;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.app-library__app:focus-visible {
  outline: 2px solid var(--theme-accent-primary);
  outline-offset: 2px;
}

/* The dock's chip, at the dock's 44px touch target. */
.app-library__chip {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--theme-bg-elevated, #fff) 60%, transparent);
  border: 1px solid hsl(var(--c-h) var(--c-s) 60% / 0.25);
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.3),
    0 2px 6px -2px hsl(var(--c-h) var(--c-s) 30% / 0.25);
}
.app-library__icon {
  width: 22px;
  height: 22px;
  color: hsl(var(--c-h) var(--c-s) calc(var(--c-l) - 6%));
}
.app-library__app--solid .app-library__chip {
  background: linear-gradient(
    160deg,
    hsl(var(--c-h) var(--c-s) calc(var(--c-l) + 12%)) 0%,
    hsl(var(--c-h) var(--c-s) var(--c-l)) 55%,
    hsl(var(--c-h) var(--c-s) calc(var(--c-l) - 8%)) 100%
  );
  border-color: transparent;
}
.app-library__app--solid .app-library__icon {
  color: #fff;
}
/* The open app: the accent ring the dock's dot stands for. */
.app-library__app--active .app-library__chip {
  box-shadow:
    0 0 0 2px var(--theme-bg-elevated, #fff),
    0 0 0 4px hsl(var(--c-h) var(--c-s) var(--c-l));
}

.app-library__label {
  max-width: 100%;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--theme-text-secondary);
}
.app-library__app--active .app-library__label {
  color: var(--theme-text-primary);
}

.app-library__badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 9999px;
  background: hsl(0 80% 55%);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--theme-bg-elevated, #fff);
}

@media (prefers-reduced-motion: reduce) {
  .app-library,
  .app-library.is-open {
    transform: none;
  }
  .app-library__grid.is-entering .app-library__item {
    animation: none;
  }
  .app-library__glyph,
  .app-library__glyph.is-open {
    transition: none;
    transform: none;
  }
}
</style>
