<!--
  The way back from the public-site preview, for an admin of this community.

  This was a floating "View: Admin · Member · Public" bar on every org page.
  Asked 2026-11-18 (plan §2.4, "One account menu"): it was cumbersome and did
  little, because each of its doors already exists where an admin looks for it:
    - Member: "Preview member view" in the community switcher's menu
      (OrgSelector), and the preview's own banner carries Exit (auth.vue).
    - Public: "View public site" in the avatar's menu and the community
      switcher's menu (`?preview`, the flag app/pages/[slug]/index.vue reads).
  What had no other door is the way back from the public landing, which has no
  workspace chrome. So that is all this is now: one small round button,
  bottom-right, on the public preview only, for an admin of THAT community.

  Mounted in both the `auth` and `auth-blank` layouts; it renders nothing in
  the workspace and nothing for anyone who is not this community's admin.
-->
<template>
  <Teleport to="body">
    <!-- allow-raw-button: a lone floating control over the public landing, outside the workspace's kit -->
    <button
      v-if="visible"
      type="button"
      class="view-back fixed bottom-4 right-4 z-[60] print:hidden"
      aria-label="Back to your workspace"
      title="Back to your workspace"
      data-view-back
      @click="goAdmin"
    >
      <Icon name="i-lucide-layout-dashboard" class="size-4" />
    </button>
  </Teleport>
</template>

<script setup lang="ts">
const route = useRoute();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { setViewAs } = useViewAs();

const slug = computed(() => route.params.slug as string | undefined);
const base = computed(() => (slug.value ? `/${slug.value}` : "/"));

// The public preview is query-driven (`?preview` on the community's root).
const visible = computed(
  () => !!slug.value && isAdminOfCurrentDomain.value && route.query.preview !== undefined
);

const goAdmin = () => {
  setViewAs("admin");
  navigateTo(base.value);
};
</script>

<style scoped>
/* A dark, quiet disc: it sits over any public theme, so it brings its own
   ground (the theme's primary text as the fill, its card as the glyph). */
.view-back {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-text-primary) 88%, transparent);
  color: var(--theme-card-bg);
  box-shadow: var(--theme-shadow-lg);
  opacity: 0.85;
  transition:
    opacity var(--motion-fast, 160ms) ease,
    scale var(--motion-fast, 160ms) var(--spring);
}
.view-back:hover,
.view-back:focus-visible {
  opacity: 1;
}
.view-back:active {
  scale: 0.92;
}
.view-back:focus-visible {
  outline: 2px solid var(--theme-accent-primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .view-back,
  .view-back:active {
    scale: 1;
    transition: none;
  }
}
</style>
