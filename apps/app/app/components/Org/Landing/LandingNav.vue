<!--
  Theme-aware navigation dispatcher for the public landing.

  Picks the nav surface off the active landing theme (the same themeState.style
  that writes html.theme-*):
    • modern          → floating macOS dock (responsive, all viewports)
    • classic / luxury → a fixed editorial HEADER (imitates 1033lenox.com): an
                         avatar on the left (→ resident portal when signed in,
                         → login otherwise), the centered org logo, and a
                         notifications + menu cluster on the right. The header
                         retracts on scroll-down and reveals on scroll-up.

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
      <!-- Editorial (classic/luxury): fixed header, retracts on scroll-down. -->
      <header
        class="landing-header fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-2 px-4 sm:px-6 h-16 transition-transform duration-300 ease-out"
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
          <img
            v-if="logoUrl"
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

// Auto-hide on scroll-down / reveal on scroll-up (+ frosted once scrolled).
const { isScrollingDown, isScrolled } = useScrollDirection();

// Centered org logo (mirrors LandingFooter's logo resolution).
const config = useRuntimeConfig();
const logoUrl = computed(() => {
  const logo = props.organization?.settings?.logo;
  if (!logo) return "";
  const id = typeof logo === "object" ? logo.id : logo;
  return `${config.public.directus.url}/assets/${id}?key=small-contain`;
});
</script>

<style scoped>
/* Transparent over the hero; frosted once the page scrolls under it. */
.landing-header {
  background: transparent;
}
.landing-header--scrolled {
  background: color-mix(in srgb, var(--theme-bg-elevated, #fff) 82%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--theme-border-primary, rgba(0, 0, 0, 0.06));
  box-shadow: var(--theme-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}
.landing-header__brand {
  color: var(--theme-text-primary, #1c1a16);
  font-family: var(--theme-heading-font);
}

/* Once the frosted (light) bar fades in, flip the glass buttons + menu mark to
   dark so the icons keep contrast against it (they're white over the hero). */
.landing-header--scrolled :deep(.landing-glass-btn) {
  background: color-mix(in srgb, var(--theme-text-primary, #1c1a16) 6%, transparent);
  border-color: color-mix(in srgb, var(--theme-text-primary, #1c1a16) 14%, transparent);
  color: var(--theme-text-primary, #1c1a16);
}
.landing-header--scrolled :deep(.landing-glass-btn:hover) {
  background: color-mix(in srgb, var(--theme-text-primary, #1c1a16) 12%, transparent);
}
.landing-header--scrolled :deep(.landing-menu-btn) {
  color: var(--theme-text-primary, #1c1a16);
}
</style>
