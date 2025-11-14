<template>
  <div class="min-h-screen bg-background flex flex-col">
    <AppNav />
    <main class="flex-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
