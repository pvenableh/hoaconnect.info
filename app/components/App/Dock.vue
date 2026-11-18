<script setup lang="ts">
const { user } = useDirectusAuth();

// The dock has no settings (Phase 4, plan §2.4): bottom only, labels on, and
// every chip in the person's tint (useAppearance writes --app-accent-*; Tint
// off drains the chips with the glass). The device's Reduce Transparency, not
// a switch, decides whether the pill is glass.
const { isOnOrgPage, apps, activeKey, badges, go } = useDockApps();

const onAppClick = go;

// ---- macOS-style magnification ----
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
  magnify.value = apps.value.map((_, i) => {
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
  magnify.value = apps.value.map(() => ({ scale: 1 }));
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

watch(apps, reset, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <nav
      v-if="user && isOnOrgPage"
      class="app-dock ui-kit"
      aria-label="App navigation"
    >
      <div
        class="app-dock__pill glass-surface glass-surface--strong"
        @pointermove="onPointerMove"
        @pointerleave="reset"
      >
        <button
          v-for="(app, i) in apps"
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
      </div>
    </nav>
  </Teleport>
</template>

<style scoped>
.app-dock {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  pointer-events: none;
  display: flex;
  justify-content: center;
}
.app-dock {
  bottom: max(1rem, env(safe-area-inset-bottom));
}
/* Below md there is no dock: a full row of chips does not fit a phone, and the
   Nav's grid button opens the same apps as the App Library instead. */
@media (max-width: 767px) {
  .app-dock {
    display: none;
  }
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
