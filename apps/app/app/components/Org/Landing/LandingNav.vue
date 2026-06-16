<!--
  Theme-aware navigation dispatcher for the public landing.

  Picks the nav surface off the active landing theme (the same themeState.style
  that writes html.theme-*):
    • modern          → floating macOS dock (responsive, all viewports)
    • classic / luxury → avatar + hamburger that opens a dark-glass slide-in
                         side menu, on every viewport (mirrors 1033lenox.com —
                         no persistent left rail)

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
      <!-- Editorial (classic/luxury): avatar + hamburger drawer, top-right, on
           every viewport — mirrors 1033lenox.com (a slide-in side menu, not a
           persistent rail). -->
      <div class="fixed top-0 right-0 z-40 flex items-center gap-2 px-4 sm:px-6 py-4">
        <OrgLandingAvatar v-if="user" :user="user" />
        <OrgLandingDrawer
          :organization="organization"
          :slug="slug"
          :user="user"
          :has-amenities="hasAmenities"
          :has-listings="hasListings"
          :has-faq="hasFaq"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import OrgLandingAvatar from "./LandingAvatar.vue";
import OrgLandingDrawer from "./LandingDrawer.vue";
import OrgLandingDock from "./LandingDock.vue";

defineProps<{
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
</script>
