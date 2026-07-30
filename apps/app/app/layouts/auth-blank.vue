<template>
  <div class="t-bg t-text t-transition min-h-screen">
    <slot />
    <!-- Admin "view as" switcher — also rides the chromeless public landing so an
         admin previewing /{slug}?preview can flip back to their workspace. -->
    <ClientOnly>
      <OrgViewSwitcher />
    </ClientOnly>
  </div>
</template>

<script setup>
// Chromeless layout for the /auth pages — no marketing nav or footer, just the
// themed background. The page (via AuthShell) supplies the centered card.
const { initTheme } = useTheme();
const route = useRoute();
// The site-preview iframe forces a specific theme via ?theme=… so the builder
// can preview classic vs modern. Restoring the app-default/stored theme here
// would clobber that, so skip init when a theme is explicitly forced.
onMounted(() => {
  if (!route.query.theme) initTheme();
});
</script>
