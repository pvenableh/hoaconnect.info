<script setup lang="ts">
// Shared chrome for the auth pages: ambient accent glows, the HOAConnect brand
// mark, the centered slot for a glass form card, and a "back" link. Mirrors the
// reference pattern established by pages/auth/login.vue.
withDefaults(
  defineProps<{
    backTo?: string;
    backLabel?: string;
  }>(),
  {
    backTo: "/",
    backLabel: "Back to home",
  }
);
</script>

<template>
  <div
    class="relative min-h-screen flex flex-col items-center justify-center t-bg t-text t-transition overflow-hidden px-4 py-12"
  >
    <!-- Ambient accent glows behind the glass card -->
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-32 -left-24 h-96 w-96 rounded-full blur-3xl opacity-30 t-bg-accent-app" />
      <div class="absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-20 t-bg-accent-app" />
    </div>

    <div class="relative w-full max-w-md">
      <!-- Brand mark -->
      <div class="mb-8 flex flex-col items-center gap-2 text-center">
        <NuxtLink to="/" class="transition hover:opacity-80">
          <span class="text-2xl font-semibold uppercase tracking-extra-wide t-text">
            <span class="font-light">HOA</span>Connect
          </span>
        </NuxtLink>
      </div>

      <slot />

      <div class="mt-6 text-center">
        <NuxtLink
          :to="backTo"
          class="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest t-text-muted hover:t-text transition-colors"
        >
          <Icon name="lucide:chevron-left" class="w-3.5 h-3.5" />
          {{ backLabel }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
