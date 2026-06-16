<!--
  Persistent left rail for the logged-in WORKSPACE under classic / luxury orgs.
  The in-app counterpart to the landing's editorial sidebar: the modern theme
  keeps the floating dock, classic/luxury get this collapsible rail (Linear/Slack
  style — top bar + left rail). Desktop only; the caller hides it < lg and folds
  the same nav into AppNav's mobile sheet.

  Shares its nav model with the dock via useAppNav (appsFor / activeKeyFor / go +
  module gating), so the two surfaces can never drift apart. Collapse mirrors the
  landing sidebar: a GSAP timeline animates the rail width (240 ↔ 56) on the SAME
  curve as the page's content-offset CSS transition (power3.inOut ≈
  cubic-bezier(0.65,0,0.35,1), 0.46s), so the rail and the shrinking page move in
  lockstep. Collapsed = icon rail with hover tooltips (reuses the dock's tip).
-->
<template>
  <aside
    ref="asideEl"
    class="app-sidebar glass-bar fixed inset-y-0 left-0 z-40 flex flex-col border-r t-border overflow-hidden will-change-[width]"
    :class="[collapsed ? 'w-14' : 'w-60', { 'app-sidebar--collapsed': collapsed }]"
    aria-label="Primary"
  >
    <!-- Brand — the org picker lives here (workspace-switcher pattern). The logo/
         initial stays in the 56px icon column; the name + switch chevron live in
         the expandable region so they clip cleanly as the rail closes. Opening it
         lets the resident switch orgs / jump to org settings (see OrgSelector). -->
    <OrgSelector>
      <template #trigger>
        <button
          type="button"
          class="app-sidebar__brand flex items-center h-16 w-full shrink-0 hover:t-bg-subtle transition-colors"
          aria-label="Switch organization"
        >
          <span class="app-sidebar__icon-col">
            <!-- Circular org avatar with a ring (distinguishes the switcher from
                 the centered brand logo in the header). -->
            <span class="app-sidebar__avatar">
              <img
                v-if="logoUrl"
                :src="logoUrl"
                :alt="orgName || 'Organization'"
                class="w-full h-full object-cover"
              />
              <span v-else class="text-xs font-semibold t-text-accent">{{ orgInitial }}</span>
            </span>
          </span>
          <span
            class="app-sidebar__label flex-1 min-w-0 font-semibold text-sm tracking-tight t-text truncate text-left"
            :style="ssrLabelStyle"
          >
            {{ orgName }}
          </span>
          <Icon
            name="i-lucide-chevrons-up-down"
            class="app-sidebar__label w-4 h-4 mr-3 t-text-muted shrink-0"
            :style="ssrLabelStyle"
          />
        </button>
      </template>
    </OrgSelector>

    <div class="app-sidebar__rule mx-3 shrink-0" />

    <!-- Primary nav -->
    <nav class="flex-1 overflow-y-auto overflow-x-hidden py-3">
      <ul class="space-y-0.5">
        <li v-for="app in apps" :key="app.key">
          <button
            type="button"
            class="app-sidebar__item"
            :class="{ 'app-sidebar__item--active': app.key === activeKey }"
            :aria-current="app.key === activeKey ? 'page' : undefined"
            @click="go(app)"
          >
            <span class="app-sidebar__tip">{{ app.label }}</span>
            <span class="app-sidebar__icon-col">
              <Icon :name="'i-lucide-' + app.icon" class="w-5 h-5" />
              <span v-if="badges[app.key]" class="app-sidebar__badge">
                {{ badges[app.key] > 9 ? "9+" : badges[app.key] }}
              </span>
            </span>
            <span class="app-sidebar__label" :style="ssrLabelStyle">{{ app.label }}</span>
          </button>
        </li>
      </ul>
    </nav>

    <!-- Collapse / expand toggle, pinned to the bottom -->
    <div class="app-sidebar__rule mx-3 shrink-0" />
    <button
      type="button"
      class="app-sidebar__item app-sidebar__toggle shrink-0"
      :aria-label="collapsed ? 'Expand menu' : 'Collapse menu'"
      @click="toggle"
    >
      <span class="app-sidebar__tip">{{ collapsed ? "Expand" : "Collapse" }}</span>
      <span class="app-sidebar__icon-col">
        <Icon
          name="i-lucide-chevrons-left"
          class="w-5 h-5 transition-transform duration-[450ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          :class="collapsed ? 'rotate-180' : ''"
        />
      </span>
      <span class="app-sidebar__label" :style="ssrLabelStyle">Collapse</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import type { AppDef } from "~/composables/useAppNav";

const { user } = useDirectusAuth();
const route = useRoute();
const config = useRuntimeConfig();
const { $gsap } = useNuxtApp() as any;

const { appsFor, activeKeyFor, go } = useAppNav();

// Role detection (mirrors App/Dock.vue) — admin vs member item set, scoped to the
// org actually being viewed so a foreign admin never sees admin nav.
const { isAdmin, currentOrg } = user.value
  ? await useSelectedOrg()
  : { isAdmin: ref(false), currentOrg: ref(null) };
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

const apps = computed<AppDef[]>(() => appsFor(showAdminUI.value));
const activeKey = computed(() => activeKeyFor(apps.value));

// Org branding
const orgName = computed(() => currentOrg.value?.organization?.name || "");
const orgInitial = computed(() => orgName.value.trim().charAt(0).toUpperCase() || "•");
const logoUrl = computed(() => {
  const logo = currentOrg.value?.organization?.settings?.logo;
  if (!logo) return "";
  const id = typeof logo === "object" ? logo.id : logo;
  return `${config.public.directus.url}/assets/${id}?key=small-contain`;
});
// Per-app unread badges (best-effort) — same mapping as the dock.
const { notifications } = useNotifications();
const badges = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const n of notifications.value || []) {
    if (n.isRead) continue;
    const key =
      n.type === "announcement" || n.type === "email"
        ? "email"
        : n.type === "payment"
        ? "payments"
        : n.type === "membership"
        ? "directory"
        : n.type === "request"
        ? "requests"
        : null;
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
});

// ── Collapse state (shared with auth.vue's content offset) ───────────────────
const collapsed = useState<boolean>("appNavCollapsed", () => false);
const toggle = () => {
  collapsed.value = !collapsed.value;
  if (import.meta.client)
    localStorage.setItem("appNavCollapsed", collapsed.value ? "1" : "0");
};

// First-paint label opacity (non-reactive snapshot so it never fights GSAP).
const ssrLabelStyle = { opacity: collapsed.value ? 0 : 1 };

// ── Smooth expand/collapse (GSAP), matched to the page's pl-* transition ─────
const RAIL_W = 240; // w-60
const RAIL_W_COLLAPSED = 56; // w-14
const asideEl = ref<HTMLElement | null>(null);

let tl: any = null;
const applyState = (isCollapsed: boolean, instant = false) => {
  if (!import.meta.client || !$gsap || !asideEl.value) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const labels = asideEl.value.querySelectorAll(".app-sidebar__label");
  tl?.kill();

  if (instant || reduce) {
    $gsap.set(asideEl.value, { width: isCollapsed ? RAIL_W_COLLAPSED : RAIL_W });
    $gsap.set(labels, { opacity: isCollapsed ? 0 : 1, x: 0 });
    return;
  }

  // Rail width and the label layer ride one curve (power3.inOut ≈ the page's
  // padding transition) so the rail, the page content, and the labels move in
  // lockstep — exactly like the landing sidebar.
  tl = $gsap.timeline({ defaults: { ease: "power3.inOut", duration: 0.46 } });
  if (isCollapsed) {
    tl.to(asideEl.value, { width: RAIL_W_COLLAPSED }, 0).to(
      labels,
      { opacity: 0, x: -8, duration: 0.2, ease: "power1.out" },
      0
    );
  } else {
    tl.to(asideEl.value, { width: RAIL_W }, 0).fromTo(
      labels,
      { opacity: 0, x: -8 },
      { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" },
      0.1
    );
  }
};

let ready = false;
onMounted(() => {
  const stored = localStorage.getItem("appNavCollapsed");
  if (stored != null) collapsed.value = stored === "1";
  applyState(collapsed.value, true);
  ready = true;
});
watch(collapsed, (v) => {
  if (ready) applyState(v, false);
});
onBeforeUnmount(() => tl?.kill());
</script>

<style scoped>
.app-sidebar {
  /* Slightly lifted off the page so the rail reads as chrome, not content. */
  box-shadow: var(--theme-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.app-sidebar__icon-col {
  position: relative;
  width: 56px; /* == collapsed rail width: keeps icons fixed as labels clip */
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Org-switcher avatar — a perfect circle with a theme-accent ring (a small
   offset gap in the rail color makes the ring read as a deliberate halo). */
.app-sidebar__avatar {
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--theme-bg-subtle, #f5f3ef);
  box-shadow:
    0 0 0 2px var(--theme-bg-elevated, #fff),
    0 0 0 3.5px var(--theme-accent-primary);
}

.app-sidebar__label {
  white-space: nowrap;
}

.app-sidebar__rule {
  height: 1px;
  background: var(--theme-divider, var(--theme-border-primary));
  opacity: 0.7;
}

/* Nav item — full-width row; icon column fixed, label fills the rest. */
.app-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 44px;
  background: transparent;
  border: 0;
  cursor: pointer;
  color: var(--theme-text-secondary, #6c6c6c);
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  transition: background-color 160ms ease, color 160ms ease,
    scale var(--motion-fast, 160ms) var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1));
}
.app-sidebar__item:hover {
  background: var(--theme-bg-secondary, rgba(0, 0, 0, 0.04));
  color: var(--theme-text-primary, #1c1a16);
}
.app-sidebar__item:active {
  scale: 0.97;
}

/* Active — accent text/icon + a left accent bar + a soft accent wash. */
.app-sidebar__item--active {
  color: var(--theme-accent-primary);
  background: color-mix(in srgb, var(--theme-accent-primary) 12%, transparent);
}
.app-sidebar__item--active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--theme-accent-primary);
}
.app-sidebar__item--active .app-sidebar__label {
  font-weight: 600;
}

.app-sidebar__toggle {
  height: 40px;
  color: var(--theme-text-muted, #9a9a9a);
}

/* Unread badge on the icon */
.app-sidebar__badge {
  position: absolute;
  top: 4px;
  right: 10px;
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
  /* Spring-bounce in when an unread count appears. */
  transform-origin: center;
  animation: badge-pop var(--motion-base, 240ms) var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1)) both;
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar__item:active {
    scale: 1;
  }
  .app-sidebar__badge {
    animation: none;
  }
}

/* Hover tooltip (collapsed only) — mirrors the dock's .dock-item__tip. */
.app-sidebar__tip {
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
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
/* Only surface tooltips when the rail is collapsed (labels are hidden then). */
.app-sidebar--collapsed .app-sidebar__item:hover .app-sidebar__tip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}
@media (any-hover: none) {
  .app-sidebar__tip {
    display: none;
  }
}
</style>
