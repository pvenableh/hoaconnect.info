<template>
  <div class="t-bg t-text t-transition min-h-screen">
    <slot />
  </div>
</template>

<script setup>
// Chromeless layout for the /auth pages — no marketing nav or footer, just the
// themed background. The page (via AuthShell) supplies the centered card.
const { initTheme } = useTheme();
onMounted(() => initTheme());
</script>
