<template>
  <!-- Blank canvas. Core supplies global theme CSS, auth, composables and the
       /api/* routes; everything visual is yours to design. -->
  <div class="bespoke-root">
    <NuxtPage />
  </div>
</template>

<style>
/* Minimal starter styling — replace with the building's bespoke design system.
   Core's theme tokens (theme.css / variables.css) are already loaded globally. */
.bespoke-root {
  min-height: 100vh;
  font-family:
    ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
</style>
