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
// Chromeless layout — no marketing nav or footer, just the themed background.
// The page supplies its own centered card (via AuthShell) or full-bleed content.
//
// This layout deliberately sets NO theme. Its pages fall into two camps and each
// owns its own: the auth/signup pages are workspace surfaces and get `theme-app`
// from AuthShell, while the platform landing and the site-preview iframe render a
// PUBLIC org theme and force it themselves via forceThemeStyle(). The old
// initTheme() call here served only the first camp, and applying a stored theme
// to all of them is what used to leave auth pages wearing whichever style the
// user last looked at.
</script>
