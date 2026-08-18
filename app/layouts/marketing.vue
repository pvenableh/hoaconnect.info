<script setup lang="ts">
// Marketing layout — the public front door at the apex (hoaconnect.info).
//
// Owns the <html> theme class for marketing routes the same way layouts/auth.vue
// does for the workspace. The marketing palette is `.theme-marketing` in
// core/app/assets/css/theme.css: gold accents and an editorial serif, versus the
// app's cyan and Proxima Nova. It is expressed as a theme class rather than a
// second global stylesheet because the marketing project this came from forked
// the app's CSS — 157 of its 178 shared custom properties are byte-identical, so
// importing it wholesale would silently redefine the app's theme by load order.
//
// Deliberately chromeless: no app header, dock, or sidebar. A visitor here has
// no org context and may not be signed in at all.
useHead({ htmlAttrs: { class: "theme-marketing" } });
</script>

<template>
  <div class="marketing-shell">
    <slot />
  </div>
</template>

<style scoped>
.marketing-shell {
  min-height: 100vh;
  background: var(--color-cream, #f6f1e7);
  color: var(--theme-text-primary);
  font-family: var(--theme-body-font);
}
</style>
