<script setup lang="ts">
import type { AppDef, HSL } from "#core/app/composables/useAppNav";

const { user } = useDirectusAuth();
const route = useRoute();

const {
  palette,
  dockPosition,
  showLabels,
  glassChrome,
  appsFor,
  accentsForApps,
  activeKeyFor,
  go,
  applyDocumentAccent,
} = useAppNav();

const onAppClick = (app: AppDef) => go(app);

// Role detection (mirrors App/Nav.vue)
const { isAdmin } = user.value ? await useSelectedOrg() : { isAdmin: ref(false) };
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { isPreviewingMember } = useViewAs();
const isOnOrgPage = computed(() => !!route.params.slug);
const showAdminUI = computed(() =>
  isPreviewingMember.value
    ? false
    : isOnOrgPage.value
    ? isAdminOfCurrentDomain.value
    : isAdmin.value
);

const apps = computed(() => appsFor(showAdminUI.value));
const accents = computed(() => accentsForApps(apps.value, palette.value));
const activeKey = computed(() => activeKeyFor(apps.value));
const activeIndex = computed(() => apps.value.findIndex((a) => a.key === activeKey.value));

const accentVars = (a: HSL) =>
  ({ "--c-h": String(a.h), "--c-s": `${a.s}%`, "--c-l": `${a.l}%` }) as Record<string, string>;

// Per-app unread badges from the notification system (best-effort)
const { notifications } = useNotifications();
const badges = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const n of notifications.value || []) {
    if (n.isRead) continue;
    // Map notification types onto the consolidated dock keys.
    const key =
      n.type === "announcement"
        ? "email"
        : n.type === "email"
        ? "email"
        : n.type === "meeting"
        ? "reporting"
        : n.type === "payment"
        ? "payments"
        : n.type === "document"
        ? "reporting"
        : n.type === "membership"
        ? "people"
        : n.type === "request"
        ? "dashboard"
        : null;
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
});

// Keep the document default accent synced to the active app
watch(
  [activeKey, palette],
  () => {
    const a = accents.value[activeIndex.value];
    if (a) applyDocumentAccent(a);
  },
  { immediate: true }
);

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
  dockPosition.value !== undefined &&
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
      :class="dockPosition === 'top' ? 'app-dock--top' : 'app-dock--bottom'"
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
          :class="{ 'dock-item--active': app.key === activeKey, 'dock-item--solid': !glassChrome }"
          :style="{ ...accentVars(accents[i]), ...chipStyle(i) }"
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
          <span v-if="showLabels" class="dock-item__label">{{ app.shortName }}</span>
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
.app-dock--bottom {
  bottom: max(1rem, env(safe-area-inset-bottom));
}
.app-dock--top {
  top: max(1rem, env(safe-area-inset-top));
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

.dock-item {
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
    scale var(--motion-fast, 160ms) var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1));
}
/* Press feedback — composes with the inline magnification transform via the
   independent `scale` property. */
.dock-item:active {
  scale: 0.9;
}
.app-dock--top .dock-item {
  transform-origin: top center;
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
  /* Glass chrome (default): frosted translucent chip, accent-colored icon */
  background: color-mix(in srgb, var(--theme-bg-elevated, #fff) 60%, transparent);
  border: 1px solid hsl(var(--c-h) var(--c-s) 60% / 0.25);
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.3),
    0 2px 6px -2px hsl(var(--c-h) var(--c-s) 30% / 0.25);
  transition: box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1), border-color 200ms ease;
}
.dock-item__icon {
  width: 22px;
  height: 22px;
  color: hsl(var(--c-h) var(--c-s) calc(var(--c-l) - 6%));
  filter: drop-shadow(0 1px 1px hsl(var(--c-h) 30% 30% / 0.25));
}

/* Solid mode (glass chrome off): colored gradient chip, white icon */
.dock-item--solid .dock-item__chip {
  background: linear-gradient(
    160deg,
    hsl(var(--c-h) var(--c-s) calc(var(--c-l) + 12%)) 0%,
    hsl(var(--c-h) var(--c-s) var(--c-l)) 55%,
    hsl(var(--c-h) var(--c-s) calc(var(--c-l) - 8%)) 100%
  );
  border-color: transparent;
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.28),
    inset 0 -1px 0 hsl(0 0% 0% / 0.08),
    0 2px 6px -2px hsl(var(--c-h) var(--c-s) var(--c-l) / 0.4);
}
.dock-item--solid .dock-item__icon {
  color: #fff;
  filter: drop-shadow(0 1px 1.5px hsl(0 0% 0% / 0.3));
}

/* Active state — accent ring + lift */
.dock-item--active .dock-item__chip {
  outline: 1.5px solid hsl(var(--c-h) var(--c-s) var(--c-l));
  outline-offset: 2px;
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
.app-dock--top .dock-item__tip {
  bottom: auto;
  top: calc(100% + 8px);
  transform: translateX(-50%) translateY(-4px);
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
.dock-item--active .dock-item__label {
  color: hsl(var(--c-h) var(--c-s) var(--c-l));
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
  animation: badge-pop var(--motion-base, 240ms) var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1)) both;
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
