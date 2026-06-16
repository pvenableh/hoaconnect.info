<template>
  <div class="min-h-screen flex flex-col t-bg t-text t-transition">
    <AppNav />
    <main class="flex-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
const { initTheme } = useTheme();

// Initialize theme on client side
onMounted(() => {
  initTheme();
});
</script>
