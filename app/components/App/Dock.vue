<script setup lang="ts">
import { NAV_LAYOUTS, meets, navEntry } from "#core/shared/nav/registry";
import { toAppDef, type AppDef } from "#core/app/composables/useAppNav";
import { afterFirstFrame, DURATION } from "#core/shared/motion";

const { user } = useDirectusAuth();
const route = useRoute();

// The dock has no settings (Phase 4, plan §2.4): bottom only, labels on, and
// every chip in the person's tint (useAppearance writes --app-accent-*; Tint
// off drains the chips with the glass). The device's Reduce Transparency, not
// a switch, decides whether the pill is glass.
const { isOnOrgPage, apps, activeKey, badges, go } = useDockApps();
const nav = useNavContext();
const { verbs, run } = useCreateVerbs();

// ---- The phone's dock (below md) -------------------------------------------
// A row of nine chips does not fit a phone, so below md the dock keeps four
// apps and an Apps button (plan §2.4, "The dock on a phone"). The app you are
// in is always one of the four. Apps opens a card exactly as wide as the dock
// with the rest of the apps and the create verbs ("+ New" has no room in a
// phone's header). The card is the floating layer, like the dock.
const COMPACT_SLOTS = 4;
const isCompact = ref(false);
let mq: MediaQueryList | null = null;
const onMq = (e: MediaQueryListEvent) => (isCompact.value = e.matches);
onMounted(() => {
  if (!window.matchMedia) return;
  mq = window.matchMedia("(max-width: 767px)");
  isCompact.value = mq.matches;
  mq.addEventListener("change", onMq);
});
onBeforeUnmount(() => mq?.removeEventListener("change", onMq));

// Destinations a phone used to reach only from the old menu sheet (a member's
// Vendors): the registry's `sheet` layout, minus what the dock already holds
// (by entry or by page). Members' layouts only: an admin's sections already
// reach the same pages (People › Board, Records › Documents), and the member
// copies beside them read as duplicates.
const extras = computed<AppDef[]>(() => {
  if (nav.layout.value === "admin") return [];
  const held = new Set(apps.value.map((a) => a.key));
  const paths = new Set(apps.value.map((a) => a.path));
  return NAV_LAYOUTS.sheet.flatMap((id) => {
    const e = navEntry(id);
    return e && !held.has(e.id) && !paths.has(e.path) && meets(e, nav.ctx.value) ? [toAppDef(e)] : [];
  });
});

const needsMore = computed(
  () => isCompact.value && (apps.value.length > COMPACT_SLOTS + 1 || extras.value.length > 0 || verbs.value.length > 0)
);
const shownApps = computed<AppDef[]>(() => {
  if (!needsMore.value) return apps.value;
  const first = apps.value.slice(0, COMPACT_SLOTS);
  const active = apps.value.find((a) => a.key === activeKey.value);
  if (!active || first.some((a) => a.key === active.key)) return first;
  return [...first.slice(0, COMPACT_SLOTS - 1), active];
});
const moreApps = computed<AppDef[]>(() => {
  if (!needsMore.value) return [];
  const shown = new Set(shownApps.value.map((a) => a.key));
  return [...apps.value.filter((a) => !shown.has(a.key)), ...extras.value];
});
const moreUnread = computed(() => moreApps.value.reduce((n, a) => n + (badges.value[a.key] || 0), 0));
const moreLabel = computed(() => (moreUnread.value > 0 ? `More apps, ${moreUnread.value} unread` : "More apps"));

// ---- The Apps card ----------------------------------------------------------
// Overlay policy (core/shared/motion): it mounts in its closed pose and opens
// after the first frame; the apps follow in the App Library's 28ms stagger
// (`apps-chip-in`). Not a modal: Esc, a tap outside or a route change close it,
// and Esc hands focus back to the Apps button.
const cardId = useId();
const moreButton = ref<HTMLElement | null>(null);
const card = ref<HTMLElement | null>(null);
const cardRendered = ref(false);
const cardOpen = ref(false);
const entering = ref(false);
let cancelFrame: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const clearTimer = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};

function showCard() {
  if (cardRendered.value) return;
  clearTimer();
  cardRendered.value = true;
  entering.value = true;
  cancelFrame = afterFirstFrame(() => {
    cardOpen.value = true;
  });
  timer = setTimeout(() => (entering.value = false), moreApps.value.length * 28 + 360);
}
function hideCard(opts?: { focus?: boolean }) {
  if (!cardRendered.value) return;
  cancelFrame?.();
  clearTimer();
  cardOpen.value = false;
  entering.value = false;
  timer = setTimeout(() => (cardRendered.value = false), DURATION.fast);
  if (opts?.focus) nextTick(() => moreButton.value?.focus());
}
const toggleCard = () => (cardRendered.value && cardOpen.value ? hideCard() : showCard());

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !cardRendered.value) return;
  e.stopPropagation();
  hideCard({ focus: true });
}
function onPointerDown(e: PointerEvent) {
  if (!cardRendered.value || !(e.target instanceof Node)) return;
  if (card.value?.contains(e.target) || moreButton.value?.contains(e.target)) return;
  hideCard();
}
watch(cardRendered, (on) => {
  if (!import.meta.client) return;
  if (on) {
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
  } else {
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
  }
});
watch(
  () => route.fullPath,
  () => hideCard()
);
watch(needsMore, (v) => {
  if (!v) hideCard();
});
onBeforeUnmount(() => {
  cancelFrame?.();
  clearTimer();
  if (import.meta.client) {
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
  }
});

const onAppClick = go;
const onVerb = (id: Parameters<typeof run>[0]) => {
  hideCard();
  run(id);
};

// ---- macOS-style magnification (pointer devices, md and up) ----
const REACH = 170; // px of influence on each side of the cursor
const MAX = 0.5; // peak extra scale (1.5x at the cursor)
const SPREAD = 18; // px of layout margin per unit of growth (expands the pill)
const chipEls = ref<HTMLElement[]>([]);
const magnify = ref<{ scale: number }[]>([]);
const setChipRef = (el: any, i: number) => {
  if (el) chipEls.value[i] = el as HTMLElement;
};

const canMagnify = () =>
  import.meta.client &&
  window.matchMedia("(min-width: 768px) and (any-hover: hover) and (any-pointer: fine)").matches;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

const onPointerMove = (e: PointerEvent) => {
  if (!canMagnify()) return reset();
  const cursorX = e.clientX;
  magnify.value = shownApps.value.map((_, i) => {
    const el = chipEls.value[i];
    if (!el) return { scale: 1 };
    const r = el.getBoundingClientRect();
    const center = r.left + r.width / 2;
    const dx = Math.abs(cursorX - center);
    const t = dx >= REACH ? 0 : 1 - dx / REACH;
    const scale = 1 + smoothstep(t) * MAX;
    return { scale };
  });
};
const reset = () => {
  magnify.value = shownApps.value.map(() => ({ scale: 1 }));
};
// Scale lifts the chip; horizontal margin spreads neighbours in LAYOUT so the
// glass pill background actually grows to wrap the magnified icons.
const chipStyle = (i: number) => {
  const m = magnify.value[i] || { scale: 1 };
  const mx = Math.max(0, m.scale - 1) * SPREAD;
  return {
    transform: `scale(${m.scale})`,
    marginLeft: `${mx}px`,
    marginRight: `${mx}px`,
  };
};

watch(shownApps, reset, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <nav
      v-if="user && isOnOrgPage"
      class="app-dock ui-kit"
      aria-label="App navigation"
    >
      <div class="app-dock__stack">
        <!-- The Apps card: as wide as the dock under it (it never widens it). -->
        <section
          v-if="cardRendered"
          :id="cardId"
          ref="card"
          class="app-dock__card glass-surface glass-surface--strong"
          :class="{ 'is-open': cardOpen }"
          aria-label="More apps"
          data-dock-more
        >
          <ul v-if="moreApps.length" class="app-dock__grid" :class="{ 'is-entering': entering }">
            <li v-for="(app, i) in moreApps" :key="app.key" class="app-dock__grid-item" :style="{ '--i': i }">
              <button
                type="button"
                class="dock-item dock-item--grid"
                :class="{ 'dock-item--active': app.key === activeKey }"
                :aria-current="app.key === activeKey ? 'page' : undefined"
                :data-dock-more-app="app.key"
                @click="onAppClick(app)"
              >
                <span class="dock-item__chip">
                  <Icon :name="'i-lucide-' + app.icon" class="dock-item__icon" />
                  <span v-if="badges[app.key]" class="dock-item__badge">
                    {{ badges[app.key]! > 9 ? "9+" : badges[app.key] }}
                  </span>
                </span>
                <span class="dock-item__label">{{ app.shortName }}</span>
              </button>
            </li>
          </ul>
          <template v-if="verbs.length">
            <p class="type-micro app-dock__card-label">Create</p>
            <ul class="app-dock__verbs">
              <li v-for="v in verbs" :key="v.id">
                <button type="button" class="app-dock__verb text-sm" :data-create-verb="v.id" @click="onVerb(v.id)">
                  <Icon :name="v.icon" class="app-dock__verb-icon" />
                  <span>{{ v.label }}</span>
                </button>
              </li>
            </ul>
          </template>
        </section>

        <div
          class="app-dock__pill glass-surface glass-surface--strong"
          @pointermove="onPointerMove"
          @pointerleave="reset"
        >
          <button
            v-for="(app, i) in shownApps"
            :key="app.key"
            :ref="(el) => setChipRef(el, i)"
            type="button"
            class="dock-item"
            :class="{ 'dock-item--active': app.key === activeKey }"
            :style="chipStyle(i)"
            :aria-label="app.label"
            :aria-current="app.key === activeKey ? 'page' : undefined"
            @click="onAppClick(app)"
          >
            <span class="dock-item__tip">{{ app.label }}</span>
            <span class="dock-item__chip">
              <Icon :name="'i-lucide-' + app.icon" class="dock-item__icon" />
              <span v-if="badges[app.key]" class="dock-item__badge">
                {{ badges[app.key] > 9 ? "9+" : badges[app.key] }}
              </span>
            </span>
            <span class="dock-item__label">{{ app.shortName }}</span>
          </button>

          <button
            v-if="needsMore"
            ref="moreButton"
            type="button"
            class="dock-item dock-item--more"
            :class="{ 'is-open': cardOpen }"
            :aria-expanded="cardOpen"
            :aria-controls="cardId"
            :aria-label="cardOpen ? 'Close more apps' : moreLabel"
            data-dock-more-trigger
            @click="toggleCard"
          >
            <span class="dock-item__chip">
              <Icon :name="cardOpen ? 'i-lucide-x' : 'i-lucide-layout-grid'" class="dock-item__icon" />
              <span v-if="moreUnread > 0 && !cardOpen" class="dock-item__dot" aria-hidden="true" />
            </span>
            <span class="dock-item__label">{{ cardOpen ? "Close" : "Apps" }}</span>
          </button>
        </div>
      </div>
    </nav>
  </Teleport>
</template>

<style scoped>
.app-dock {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* Over the admin's View switcher (60), which sits just above the pill on a
     phone, so an open Apps card is never covered by it. */
  z-index: 61;
  pointer-events: none;
  display: flex;
  justify-content: center;
}
.app-dock {
  bottom: max(1rem, env(safe-area-inset-bottom));
}
/* The pill and the Apps card above it, one column. The column is as wide as
   the pill: the card asks for no width of its own (`width: 0`) and fills the
   column (`min-width: 100%`), so it can never widen the dock. */
.app-dock__stack {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.625rem;
}

/* ---- The Apps card (phones) ---- */
.app-dock__card {
  pointer-events: auto;
  width: 0;
  min-width: 100%;
  max-height: min(70dvh, 34rem);
  overflow-y: auto;
  padding: 0.75rem 0.625rem;
  border-radius: 1.75rem;
  transform-origin: bottom center;
  opacity: 0;
  transform: scale(0.94) translateY(8px);
  /* Leaving: quicker than arriving, accelerating, no stagger. */
  transition:
    opacity var(--motion-fast, 160ms) var(--ease-exit),
    transform var(--motion-fast, 160ms) var(--ease-exit);
}
.app-dock__card.is-open {
  opacity: 1;
  transform: none;
  transition:
    opacity var(--motion-panel, 460ms) var(--spring),
    transform var(--motion-panel, 460ms) var(--spring);
}
.app-dock__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  row-gap: 0.75rem;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
}
.app-dock__grid.is-entering .app-dock__grid-item {
  animation: apps-chip-in 320ms var(--spring-bounce) backwards;
  animation-delay: calc(var(--i, 0) * 28ms);
}
.dock-item--grid {
  width: 100%;
}
.app-dock__card-label {
  margin: 0.75rem 0.375rem 0.375rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--theme-border-light);
}
.app-dock__grid + .app-dock__card-label {
  margin-top: 0.5rem;
}
.app-dock__verbs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.app-dock__verb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--theme-bg-secondary) 70%, transparent);
  color: var(--theme-text-primary);
  font-weight: 500;
  line-height: 1.25;
  text-align: left;
}
.app-dock__verb:hover {
  background: var(--theme-bg-secondary);
}
.app-dock__verb:focus-visible,
.dock-item:focus-visible {
  outline: 2px solid var(--theme-accent-primary);
  outline-offset: 2px;
}
.app-dock__verb-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--theme-accent-primary);
}

/* The Apps chip: neutral, so it reads as "more", not as an app. Open, it turns
   to the ink and its glyph becomes a close. */
.dock-item--more .dock-item__chip {
  background: var(--theme-bg-secondary);
  border-color: var(--theme-border-secondary);
}
.dock-item--more .dock-item__icon {
  color: var(--theme-text-secondary);
  filter: none;
}
.dock-item--more.is-open .dock-item__chip {
  background: var(--theme-text-primary);
  border-color: var(--theme-text-primary);
}
.dock-item--more.is-open .dock-item__icon {
  color: var(--theme-bg-elevated);
}
.dock-item__dot {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background: var(--destructive);
  box-shadow: 0 0 0 2px var(--theme-card-bg);
}

.app-dock__pill {
  pointer-events: auto;
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 0.8rem;
  border-radius: 9999px;
  /* Visible overflow so magnified icons rise above the pill (macOS dock),
     and the flex row + glass background grow with the chips' margins. */
  overflow: visible;
  transition: padding 90ms ease-out;
}

/* Every chip wears the person's tint; Tint off (--glass-tint 0) drains its
   saturation, so the icons go neutral with the glass. */
.dock-item {
  --c-h: var(--app-accent-h);
  --c-s: calc(var(--app-accent-s) * var(--glass-tint, 1));
  --c-l: var(--app-accent-l);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  transform-origin: bottom center;
  transition: transform 90ms ease-out, margin 90ms ease-out,
    scale var(--motion-fast, 160ms) var(--spring);
}
/* Press feedback — composes with the inline magnification transform via the
   independent `scale` property. */
.dock-item:active {
  scale: 0.9;
}

/* Perfect-circle chip — 44px meets the HIG/WCAG 2.5.5 touch-target minimum. */
.dock-item__chip {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* A frosted chip with the icon in the tint (no blur of its own: the pill is the glass). */
  background: color-mix(in srgb, var(--theme-bg-elevated, #fff) 60%, transparent);
  border: 1px solid hsl(var(--c-h) var(--c-s) 60% / 0.25);
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.3),
    0 2px 6px -2px hsl(var(--c-h) var(--c-s) 30% / 0.25);
  transition: box-shadow 200ms var(--ease-out-expo), border-color 200ms ease;
}
.dock-item__icon {
  width: 22px;
  height: 22px;
  color: hsl(var(--c-h) var(--c-s) calc(var(--c-l) - 6%));
  filter: drop-shadow(0 1px 1px hsl(var(--c-h) 30% 30% / 0.25));
}

/* Hover tooltip (full app name), floats above the chip */
.dock-item__tip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  padding: 3px 9px;
  border-radius: 9999px;
  background: var(--theme-text-primary, #1c1a16);
  color: var(--theme-bg-elevated, #fff);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease, transform 140ms ease;
  z-index: 2;
}
.dock-item:hover .dock-item__tip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
@media (any-hover: none) {
  .dock-item__tip { display: none; }
}

.dock-item__label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1;
  max-width: 5rem;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--theme-text-secondary, #6b7280);
}
/* The open app: its label in the ink (AA on the pill), since labels are on
   and the old running-app dot would collide with them. */
.dock-item--active .dock-item__label {
  color: var(--theme-accent-primary);
}

.dock-item__badge {
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
  box-shadow: 0 0 0 2px var(--theme-card-bg, #fff);
  /* Spring-bounce in when an unread count appears. */
  transform-origin: center;
  animation: badge-pop var(--motion-base, 240ms) var(--spring) both;
}

@media (prefers-reduced-motion: reduce) {
  .app-dock__card,
  .app-dock__card.is-open {
    transform: none;
  }
  .app-dock__grid.is-entering .app-dock__grid-item {
    animation: none;
  }
  .dock-item {
    transition: none;
  }
  .dock-item:active {
    scale: 1;
  }
  .dock-item__badge {
    animation: none;
  }
}
</style>
