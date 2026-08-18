<!--
  Theme-aware navigation dispatcher for the public landing.

  Picks the nav surface off the active landing theme (the same themeState.style
  that writes html.theme-*):
    • modern          → floating macOS dock (responsive, all viewports)
    • classic / luxury → a fixed editorial HEADER (imitates 1033lenox.com): an
                         avatar on the left (→ resident portal when signed in,
                         → login otherwise), the centered org logo, and a
                         notifications + menu cluster on the right. The header is
                         a frosted bar at all times and retracts on scroll-down.

  The centered logo is dynamic: an uploaded SVG is inlined so its paths animate a
  color-fill (like 1033's NewLogo); a raster (PNG, ideally transparent) renders
  as an <img>.

  All share one model via useLandingNav, so wording/links/locks stay in sync.
  Children self-position (fixed), so this can live anywhere in the hero markup.
-->
<template>
  <div>
    <template v-if="variant === 'dock'">
      <OrgLandingDock
        :organization="organization"
        :slug="slug"
        :user="user"
        :has-amenities="hasAmenities"
        :has-listings="hasListings"
        :has-faq="hasFaq"
      />
    </template>

    <template v-else>
      <!-- Editorial (classic/luxury): frosted fixed header, retracts on scroll-down. -->
      <header
        class="landing-header fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-2 px-4 sm:px-6 h-16"
        :class="[
          isScrollingDown ? '-translate-y-full' : 'translate-y-0',
          isScrolled ? 'landing-header--scrolled' : '',
        ]"
      >
        <!-- Left: avatar → portal when signed in, else a login entry point. -->
        <div class="flex items-center shrink-0">
          <OrgLandingAvatar v-if="user" :user="user" />
          <a
            v-else
            href="/auth/login"
            class="landing-glass-btn w-10 h-10"
            aria-label="Log in"
            title="Log in"
          >
            <Icon name="lucide:user" class="w-5 h-5" />
          </a>
        </div>

        <!-- Center: org logo / name → org home. -->
        <NuxtLink
          :to="`/${slug}`"
          class="flex items-center justify-center min-w-0"
          aria-label="Home"
        >
          <!-- eslint-disable-next-line vue/no-v-html — admin-uploaded SVG, scripts stripped -->
          <span
            v-if="isSvgLogo && logoSvg"
            class="landing-header__logo landing-header__logo-svg"
            v-html="logoSvg"
          />
          <img
            v-else-if="logoUrl"
            :src="logoUrl"
            :alt="organization?.name || 'Home'"
            class="landing-header__logo h-8 sm:h-9 max-h-9 w-auto max-w-[150px] sm:max-w-[200px] object-contain"
          />
          <span
            v-else
            class="landing-header__brand text-sm uppercase tracking-ultra-wide truncate"
          >
            {{ organization?.name }}
          </span>
        </NuxtLink>

        <!-- Right: notifications + menu. -->
        <div class="flex items-center gap-2 shrink-0">
          <a
            :href="user ? '/dashboard' : '/auth/login'"
            class="landing-glass-btn w-10 h-10"
            aria-label="Notifications"
            title="Notifications"
          >
            <Icon name="lucide:bell" class="w-5 h-5" />
          </a>
          <OrgLandingDrawer
            :organization="organization"
            :slug="slug"
            :user="user"
            :has-amenities="hasAmenities"
            :has-listings="hasListings"
            :has-faq="hasFaq"
          />
        </div>
      </header>
    </template>
  </div>
</template>

<script setup lang="ts">
import OrgLandingAvatar from "./LandingAvatar.vue";
import OrgLandingDrawer from "./LandingDrawer.vue";
import OrgLandingDock from "./LandingDock.vue";

const props = defineProps<{
  organization: any;
  slug: string;
  user?: any;
  hasAmenities?: boolean;
  hasListings?: boolean;
  hasFaq?: boolean;
}>();

// Drive the variant off the active landing theme. themeStyle is the value that
// sets the html.theme-* class (SSR-safe, set synchronously by the page's
// forceThemeStyle), so reading it here matches what the CSS renders.
const { themeStyle } = useTheme();
const variant = computed(() => (themeStyle.value === "modern" ? "dock" : "editorial"));

// Auto-hide on scroll-down / reveal on scroll-up (+ border/shadow once scrolled).
const { isScrollingDown, isScrolled } = useScrollDirection();

// ── Centered org logo (dynamic: inline animated SVG, else <img>) ─────────────
const config = useRuntimeConfig();
const logoFile = computed(() => props.organization?.settings?.logo);
const logoId = computed(() => {
  const l = logoFile.value;
  return l ? (typeof l === "object" ? l.id : l) : "";
});
const isSvgLogo = computed(
  () => typeof logoFile.value === "object" && logoFile.value?.type === "image/svg+xml"
);
const logoUrl = computed(() =>
  logoId.value ? `${config.public.directus.url}/assets/${logoId.value}?key=small-contain` : ""
);

// Inline the SVG markup (SSR-fetched so it's animatable from first paint, no
// hydration mismatch). Scripts/handlers stripped — it's admin-uploaded.
const { data: logoSvg } = useAsyncData(
  `landing-logo-svg-${logoId.value || "none"}`,
  async () => {
    if (!isSvgLogo.value || !logoId.value) return "";
    try {
      const raw = await $fetch<string>(`${config.public.directus.url}/assets/${logoId.value}`, {
        responseType: "text",
      });
      return String(raw)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/\son\w+="[^"]*"/gi, "");
    } catch {
      return "";
    }
  },
  { watch: [logoId, isSvgLogo] }
);
</script>

<style scoped>
/* Frosted theme-tinted bar at all times (like 1033's always-on header bg);
   scrolling only adds the border + shadow. */
.landing-header {
  background: color-mix(in srgb, var(--theme-bg-elevated, #fff) 82%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid transparent;
  /* Tailwind v4 toggles the `translate` property (not `transform`) for
     -translate-y-full, so transition `translate` or the reveal snaps. */
  transition:
    translate 0.35s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.3s ease,
    box-shadow 0.3s ease;
  will-change: translate;
}
.landing-header--scrolled {
  border-bottom-color: var(--theme-border-primary, rgba(0, 0, 0, 0.06));
  box-shadow: var(--theme-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}
.landing-header__brand {
  color: var(--theme-text-primary, #1c1a16);
  font-family: var(--theme-heading-font);
}

/* The bar is light at all times now, so the icon buttons are dark for contrast
   and carry no background/border — just the glyph (a subtle wash on hover). */
.landing-header :deep(.landing-glass-btn) {
  background: transparent;
  border-color: transparent;
  /* Drop the glass blur too — it reads as a background disc. */
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  color: var(--theme-text-primary, #1c1a16);
}
.landing-header :deep(.landing-glass-btn:hover) {
  background: color-mix(in srgb, var(--theme-text-primary, #1c1a16) 8%, transparent);
}
.landing-header :deep(.landing-menu-btn) {
  color: var(--theme-text-primary, #1c1a16);
}

/* Inline SVG logo — height-bound, paths animate a color-fill wave between the
   theme text colour and the theme accent (mirrors 1033's NewLogo). */
.landing-header__logo-svg {
  display: inline-flex;
  align-items: center;
  height: 2rem;
  max-width: 200px;
}
@media (min-width: 640px) {
  .landing-header__logo-svg {
    height: 2.25rem;
  }
}
.landing-header__logo-svg :deep(svg) {
  height: 100%;
  width: auto;
  max-width: 200px;
  display: block;
}
.landing-header__logo-svg :deep(path) {
  fill: var(--theme-text-primary, #1c1a16);
  animation: landing-logo-fill 6s ease-in-out infinite;
}
.landing-header__logo-svg :deep(path:nth-of-type(2)) { animation-delay: 0.1s; }
.landing-header__logo-svg :deep(path:nth-of-type(3)) { animation-delay: 0.2s; }
.landing-header__logo-svg :deep(path:nth-of-type(4)) { animation-delay: 0.3s; }
.landing-header__logo-svg :deep(path:nth-of-type(5)) { animation-delay: 0.4s; }
.landing-header__logo-svg :deep(path:nth-of-type(6)) { animation-delay: 0.5s; }
.landing-header__logo-svg :deep(path:nth-of-type(7)) { animation-delay: 0.6s; }
.landing-header__logo-svg :deep(path:nth-of-type(8)) { animation-delay: 0.7s; }
.landing-header__logo-svg :deep(path:nth-of-type(9)) { animation-delay: 0.8s; }
.landing-header__logo-svg :deep(path:nth-of-type(10)) { animation-delay: 0.9s; }
.landing-header__logo-svg :deep(path:nth-of-type(n + 11)) { animation-delay: 1s; }

@keyframes landing-logo-fill {
  0%,
  100% {
    fill: var(--theme-text-primary, #1c1a16);
  }
  50% {
    fill: var(--theme-accent-primary);
  }
}
@media (prefers-reduced-motion: reduce) {
  .landing-header__logo-svg :deep(path) {
    animation: none;
    fill: var(--theme-text-primary, #1c1a16);
  }
}
</style>
