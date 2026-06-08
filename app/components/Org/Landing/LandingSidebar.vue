<!--
  Editorial left rail for the public landing (CLASSIC / LUXURY themes).
  Imitates 1033lenox.com: a slim, COLLAPSIBLE vertical rail on the light
  editorial surface. Collapsed by default so the landing reads full-bleed like
  1033 (just a chevron + login/avatar); expanded reveals the brand, the locked
  resident-portal teaser, and the access CTAs. No "explore" anchor list — the
  hero + scrolling sections carry the page. Desktop only; the caller hides it
  < lg and falls back to LandingDrawer on mobile.

  Both bodies (expanded + collapsed icon rail) stay PERMANENTLY MOUNTED — the
  expand/collapse is one GSAP timeline that animates the rail width together with
  each body's opacity/x. Nothing remounts, so the brand title never reflows or
  "drops" mid-transition. Shares its nav model with the dock + drawer via
  useLandingNav.
-->
<template>
  <aside
    ref="asideEl"
    class="landing-sidebar fixed inset-y-0 left-0 z-40 flex flex-col t-bg border-r t-border overflow-hidden will-change-[width]"
    :class="collapsed ? 'w-14' : 'w-60'"
  >
    <!-- Collapse / expand toggle (right-anchored so it glides with the width) -->
    <div class="flex items-center justify-end px-3 pt-4 pb-2 shrink-0">
      <button
        type="button"
        class="landing-sidebar__toggle"
        :aria-label="collapsed ? 'Expand menu' : 'Collapse menu'"
        @click="toggle"
      >
        <Icon
          name="lucide:chevron-right"
          class="w-4 h-4 transition-transform duration-[450ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          :class="collapsed ? '' : 'rotate-180'"
        />
      </button>
    </div>

    <!-- Expanded body -->
    <div
      ref="expandedEl"
      class="flex flex-col flex-1 min-h-0 will-change-[transform,opacity]"
      :style="ssrInitialStyle.expanded"
    >
      <div class="px-7 pb-5 shrink-0">
        <a href="#top" class="block group">
          <img
            v-if="logoUrl"
            :src="logoUrl"
            :alt="organization?.name"
            class="h-9 w-auto object-contain mb-3"
          />
          <h2 class="font-serif t-text text-2xl leading-tight tracking-tight group-hover:opacity-70 transition-opacity whitespace-nowrap">
            {{ organization?.name }}
          </h2>
        </a>
      </div>

      <div class="landing-rule mx-7 mb-2 shrink-0" />

      <!-- Locked resident-portal teaser -->
      <nav class="flex-1 overflow-y-auto px-7 py-4">
        <template v-if="portalLinks.length">
          <ul class="space-y-0.5">
            <li v-for="p in portalLinks" :key="p.key">
              <a :href="lockHref" class="landing-sidebar__link landing-sidebar__link--locked">
                <Icon :name="p.icon" class="w-4 h-4 opacity-40" />
                {{ p.label }}
                <Icon name="lucide:lock" class="w-3 h-3 ml-auto opacity-40" />
              </a>
            </li>
          </ul>
          <p class="mt-4 text-[11px] leading-relaxed t-text-muted">{{ portalIntro }}</p>
        </template>
      </nav>

      <!-- Access actions -->
      <div class="px-7 py-6 border-t t-border space-y-3 shrink-0">
        <a :href="primaryAction.href" class="landing-sidebar__cta">
          <Icon :name="primaryAction.icon" class="w-4 h-4" />
          {{ primaryAction.label }}
        </a>
        <template v-if="!isSignedIn">
          <NuxtLink
            v-for="a in accessActions"
            :key="a.label"
            :to="a.to"
            class="landing-sidebar__link landing-sidebar__link--action"
          >
            <Icon :name="a.icon" class="w-4 h-4 opacity-50" />
            {{ a.label }}
          </NuxtLink>
        </template>
        <div v-if="user" class="pt-2">
          <OrgLandingAvatar :user="user" />
        </div>
      </div>
    </div>

    <!-- Collapsed body: icon-only login + avatar, pinned to the bottom. Absolute
         so it overlays the (faded-out) expanded actions without affecting flow. -->
    <div
      ref="collapsedEl"
      class="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-6 will-change-[opacity]"
      :style="ssrInitialStyle.collapsed"
    >
      <a :href="primaryAction.href" class="landing-sidebar__icon-cta" :title="primaryAction.label">
        <Icon :name="primaryAction.icon" class="w-4 h-4" />
      </a>
      <OrgLandingAvatar v-if="user" :user="user" />
    </div>
  </aside>
</template>

<script setup lang="ts">
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
  lockHref,
  portalLinks,
  portalIntro,
  primaryAction,
  accessActions,
} = useLandingNav({
  organization: () => props.organization,
  slug: () => props.slug,
  user: () => props.user,
  hasAmenities: () => props.hasAmenities,
  hasListings: () => props.hasListings,
  hasFaq: () => props.hasFaq,
});

// Collapse state shared with PublicLanding (drives the page's desktop offset).
// Default collapsed so the landing opens full-bleed like 1033lenox.com.
const collapsed = useState<boolean>("landingNavCollapsed", () => true);
const toggle = () => {
  collapsed.value = !collapsed.value;
  if (import.meta.client) localStorage.setItem("landingNavCollapsed", collapsed.value ? "1" : "0");
};

// ── Smooth expand/collapse (GSAP) ──────────────────────────────────────────
const RAIL_W = 240; // w-60
const RAIL_W_COLLAPSED = 56; // w-14
// The expanded body slides its FULL width so it reads as a panel sliding off /
// in (not a fade). Matching the rail width's distance keeps the two locked.
const SLIDE = RAIL_W;
const asideEl = ref<HTMLElement | null>(null);
const expandedEl = ref<HTMLElement | null>(null);
const collapsedEl = ref<HTMLElement | null>(null);
let tl: any = null;

// First-paint opacity (captured once, non-reactive so it never fights GSAP).
// Avoids a flash of the clipped expanded body before onMounted runs applyState.
const ssrCollapsed = collapsed.value;
const ssrInitialStyle = {
  expanded: { opacity: ssrCollapsed ? 0 : 1 },
  collapsed: { opacity: ssrCollapsed ? 1 : 0 },
};

// Drive the rail to a state. `instant` skips the tween (initial paint / reduced
// motion). The width and both bodies move on ONE timeline so they stay locked
// together — the expanded content slides in horizontally with the panel rather
// than popping into a settled layout.
const applyState = (isCollapsed: boolean, instant = false) => {
  if (!import.meta.client || !$gsap || !asideEl.value) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  tl?.kill();

  if (instant || reduce) {
    $gsap.set(asideEl.value, { width: isCollapsed ? RAIL_W_COLLAPSED : RAIL_W });
    $gsap.set(expandedEl.value, {
      opacity: isCollapsed ? 0 : 1,
      x: isCollapsed ? -SLIDE : 0,
      pointerEvents: isCollapsed ? "none" : "auto",
    });
    $gsap.set(collapsedEl.value, { opacity: isCollapsed ? 1 : 0, pointerEvents: isCollapsed ? "auto" : "none" });
    return;
  }

  // Everything rides ONE curve (power3.inOut ≈ the page's pl-* CSS transition,
  // cubic-bezier(0.65,0,0.35,1)) over the SAME 0.46s, starting together at 0 —
  // so the rail width, the page content, and the panel body move in lockstep.
  tl = $gsap.timeline({ defaults: { ease: "power3.inOut", duration: 0.46 } });
  if (isCollapsed) {
    // Panel slides its full width off to the left in step with the closing rail;
    // it stays opaque WHILE it travels (so you see it slide, not fade) and only
    // fades over the final stretch to clean up the tail.
    tl.to(asideEl.value, { width: RAIL_W_COLLAPSED }, 0)
      .to(expandedEl.value, { x: -SLIDE, pointerEvents: "none" }, 0)
      .to(expandedEl.value, { opacity: 0, duration: 0.18, ease: "power1.out" }, 0.28)
      .to(collapsedEl.value, { opacity: 1, pointerEvents: "auto", duration: 0.26, ease: "power2.out" }, 0.22);
  } else {
    // Reverse: panel slides in from off-left, opaque the whole way (clipped while
    // still off-screen), perfectly tracking the opening rail and shrinking page.
    tl.to(collapsedEl.value, { opacity: 0, pointerEvents: "none", duration: 0.16, ease: "power1.in" }, 0)
      .to(asideEl.value, { width: RAIL_W }, 0)
      .fromTo(
        expandedEl.value,
        { x: -SLIDE, opacity: 1 },
        { x: 0, pointerEvents: "auto" },
        0
      );
  }
};

let ready = false;
onMounted(() => {
  const stored = localStorage.getItem("landingNavCollapsed");
  if (stored != null) collapsed.value = stored === "1";
  // Lock in the starting state with no animation, then enable animated toggles.
  applyState(collapsed.value, true);
  ready = true;
});
watch(collapsed, (v) => {
  if (ready) applyState(v, false);
});
onBeforeUnmount(() => tl?.kill());

const logoUrl = computed(() => {
  const logo = props.organization?.logo;
  if (!logo) return "";
  const id = typeof logo === "object" ? logo.id : logo;
  return `${config.public.directus.url}/assets/${id}`;
});
</script>
