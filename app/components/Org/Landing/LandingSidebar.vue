<!--
  Editorial left rail for the public landing (CLASSIC / LUXURY themes), styled to
  MATCH the logged-in workspace rail (app/components/App/Sidebar.vue) so the
  landing and the portal read as one product: brand at top, icon+label nav rows,
  a collapse toggle at the bottom, hover tooltips when collapsed.

  The nav lists the resident-portal sections. For a LOGGED-OUT visitor, clicking a
  section does NOT navigate — it fires a sonner toast explaining they need to log
  in or create an account (with a "Log in" action). A signed-in viewer (admin
  previewing, or a member browsing the public site) navigates into that section.

  Collapse mirrors the workspace rail: a GSAP timeline animates the rail width
  (240 ↔ 56) while labels fade/slide, on the same curve as the page's content
  offset. Shares `landingNavCollapsed` with PublicLanding (drives the desktop
  offset) — kept default-collapsed so the hero opens full-bleed. Desktop only; the
  caller hides it < lg and falls back to LandingDrawer on mobile.
-->
<template>
  <aside
    ref="asideEl"
    class="landing-rail fixed inset-y-0 left-0 z-40 flex flex-col t-bg-elevated border-r t-border overflow-hidden will-change-[width]"
    :class="[collapsed ? 'w-14' : 'w-60', { 'landing-rail--collapsed': collapsed }]"
    aria-label="Resident portal"
  >
    <!-- Brand -->
    <a href="#top" class="landing-rail__brand flex items-center h-16 shrink-0 hover:opacity-80 transition-opacity">
      <span class="landing-rail__icon-col">
        <img
          v-if="logoUrl"
          :src="logoUrl"
          :alt="organization?.name"
          class="w-7 h-7 object-contain rounded"
        />
        <span
          v-else
          class="w-7 h-7 rounded-md grid place-items-center text-xs font-semibold t-bg-accent/15 t-text-accent"
        >
          {{ orgInitial }}
        </span>
      </span>
      <span class="landing-rail__label font-serif text-base tracking-tight t-text truncate pr-3" :style="ssrLabelStyle">
        {{ organization?.name }}
      </span>
    </a>

    <div class="landing-rail__rule mx-3 shrink-0" />

    <!-- Portal sections -->
    <nav class="flex-1 overflow-y-auto overflow-x-hidden py-3">
      <ul class="space-y-0.5">
        <li v-for="p in portalLinks" :key="p.key">
          <button type="button" class="landing-rail__item" @click="onSectionClick(p)">
            <span class="landing-rail__tip">{{ p.label }}</span>
            <span class="landing-rail__icon-col">
              <Icon :name="p.icon" class="w-5 h-5" />
              <Icon
                v-if="!isSignedIn"
                name="lucide:lock"
                class="landing-rail__lock"
              />
            </span>
            <span class="landing-rail__label" :style="ssrLabelStyle">{{ p.label }}</span>
          </button>
        </li>
      </ul>

      <p
        v-if="portalIntro"
        class="landing-rail__intro px-4 mt-3 text-[11px] leading-relaxed t-text-muted"
        :style="ssrLabelStyle"
      >
        {{ portalIntro }}
      </p>
    </nav>

    <!-- Access actions -->
    <div class="landing-rail__rule mx-3 shrink-0" />
    <div class="px-3 py-3 shrink-0 space-y-2">
      <a :href="primaryAction.href" class="landing-rail__cta" :title="primaryAction.label">
        <span class="landing-rail__icon-col landing-rail__icon-col--tight">
          <Icon :name="primaryAction.icon" class="w-5 h-5" />
        </span>
        <span class="landing-rail__label" :style="ssrLabelStyle">{{ primaryAction.label }}</span>
      </a>
      <template v-if="!isSignedIn">
        <NuxtLink
          v-for="a in accessActions"
          :key="a.label"
          :to="a.to"
          class="landing-rail__item landing-rail__item--quiet"
        >
          <span class="landing-rail__icon-col"><Icon :name="a.icon" class="w-5 h-5" /></span>
          <span class="landing-rail__label" :style="ssrLabelStyle">{{ a.label }}</span>
        </NuxtLink>
      </template>
      <div v-if="user" class="pt-1 flex justify-center">
        <OrgLandingAvatar :user="user" />
      </div>
    </div>

    <!-- Collapse / expand toggle -->
    <div class="landing-rail__rule mx-3 shrink-0" />
    <button
      type="button"
      class="landing-rail__item landing-rail__toggle shrink-0"
      :aria-label="collapsed ? 'Expand menu' : 'Collapse menu'"
      @click="toggle"
    >
      <span class="landing-rail__tip">{{ collapsed ? "Expand" : "Collapse" }}</span>
      <span class="landing-rail__icon-col">
        <Icon
          name="i-lucide-chevrons-left"
          class="w-5 h-5 transition-transform duration-[450ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          :class="collapsed ? 'rotate-180' : ''"
        />
      </span>
      <span class="landing-rail__label" :style="ssrLabelStyle">Collapse</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { toast } from "vue-sonner";
import { NuxtLink } from "#components";
import OrgLandingAvatar from "./LandingAvatar.vue";

const props = defineProps<{
  organization: any;
  slug: string;
  user?: any;
  hasAmenities?: boolean;
  hasListings?: boolean;
  hasFaq?: boolean;
}>();

const config = useRuntimeConfig();
const { $gsap } = useNuxtApp() as any;

const {
  user,
  isSignedIn,
  portalLinks,
  portalIntro,
  primaryAction,
  accessActions,
  memberNoun,
} = useLandingNav({
  organization: () => props.organization,
  slug: () => props.slug,
  user: () => props.user,
  hasAmenities: () => props.hasAmenities,
  hasListings: () => props.hasListings,
  hasFaq: () => props.hasFaq,
});

const orgInitial = computed(
  () => (props.organization?.name || "").trim().charAt(0).toUpperCase() || "•"
);
const logoUrl = computed(() => {
  const logo = props.organization?.logo;
  if (!logo) return "";
  const id = typeof logo === "object" ? logo.id : logo;
  return `${config.public.directus.url}/assets/${id}`;
});

// Resident-portal section → in-app path (for a signed-in viewer browsing the
// public site). Logged-out visitors never navigate — they get the toast.
const SECTION_PATHS: Record<string, string> = {
  home: "/dashboard",
  dashboard: "/dashboard",
  announcements: "/announcements",
  documents: "/documents",
  meetings: "/meetings",
  payments: "/payments",
  requests: "/requests",
  rules: "/rules",
  polls: "/polls",
  directory: "/directory",
};

const onSectionClick = (p: { key: string; label: string }) => {
  if (!isSignedIn.value) {
    toast(`${p.label} is for ${memberNoun.value.plural.toLowerCase()}`, {
      description: `Sign in or create an account to access the ${memberNoun.value.singular.toLowerCase()} portal.`,
      action: { label: "Log in", onClick: () => navigateTo("/auth/login") },
    });
    return;
  }
  const path = SECTION_PATHS[p.key] || "/dashboard";
  navigateTo(props.slug ? `/${props.slug}${path}` : path);
};

// ── Collapse state (shared with PublicLanding's desktop offset) ──────────────
const collapsed = useState<boolean>("landingNavCollapsed", () => true);
const toggle = () => {
  collapsed.value = !collapsed.value;
  if (import.meta.client)
    localStorage.setItem("landingNavCollapsed", collapsed.value ? "1" : "0");
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
  const labels = asideEl.value.querySelectorAll(".landing-rail__label, .landing-rail__intro");
  tl?.kill();

  if (instant || reduce) {
    $gsap.set(asideEl.value, { width: isCollapsed ? RAIL_W_COLLAPSED : RAIL_W });
    $gsap.set(labels, { opacity: isCollapsed ? 0 : 1, x: 0 });
    return;
  }

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
  const stored = localStorage.getItem("landingNavCollapsed");
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
.landing-rail {
  box-shadow: var(--theme-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.landing-rail__icon-col {
  position: relative;
  width: 56px; /* == collapsed rail width: keeps icons fixed as labels clip */
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.landing-rail__label {
  white-space: nowrap;
}

.landing-rail__rule {
  height: 1px;
  background: var(--theme-divider, var(--theme-border-primary));
  opacity: 0.7;
}

.landing-rail__item {
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
  transition: background-color 160ms ease, color 160ms ease;
}
.landing-rail__item:hover {
  background: var(--theme-bg-secondary, rgba(0, 0, 0, 0.04));
  color: var(--theme-text-primary, #1c1a16);
}
.landing-rail__item--quiet {
  height: 40px;
  color: var(--theme-text-muted, #9a9a9a);
  text-decoration: none;
}
.landing-rail__toggle {
  height: 40px;
  color: var(--theme-text-muted, #9a9a9a);
}

/* Lock glyph on the icon (logged-out portal teaser) */
.landing-rail__lock {
  position: absolute;
  top: 6px;
  right: 12px;
  width: 11px;
  height: 11px;
  opacity: 0.45;
}

/* Primary CTA — filled accent, matches the workspace's primary affordance */
.landing-rail__cta {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 44px;
  border-radius: 10px;
  background: var(--theme-accent-primary);
  color: var(--theme-text-inverse, #fff);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: filter 160ms ease;
}
.landing-rail__cta:hover {
  filter: brightness(0.95);
}
.landing-rail__icon-col--tight {
  width: 44px;
}

/* Hover tooltip (collapsed only) — same as the workspace rail */
.landing-rail__tip {
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
.landing-rail--collapsed .landing-rail__item:hover .landing-rail__tip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}
@media (any-hover: none) {
  .landing-rail__tip {
    display: none;
  }
}
</style>
