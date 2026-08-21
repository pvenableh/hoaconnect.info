<script setup lang="ts">
// Shared chrome for the auth pages: ambient accent glows, the brand mark, the
// centered slot for a glass form card, and a "back" link. On a tenant's custom
// domain the mark becomes that org's logo/name (so a resident signing in at
// 605lincolnroad.com sees their community, not a generic HOA Connect header);
// on the main app host it stays the HOAConnect wordmark. Mirrors the reference
// pattern established by pages/auth/login.vue.
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

// Signing in is a workspace surface, not a public one: it wears `theme-app` in
// the user's light/dark, never the org's landing-page style. This sits here
// rather than in the auth-blank layout because that layout is shared with the
// platform landing and the site-preview iframe, which render PUBLIC themes.
useWorkspaceAppearance();

const config = useRuntimeConfig();
const { activeHoa, isCustomDomain } = useActiveHoa();

// Only co-brand when we're on a tenant's domain with a resolved org.
const showOrgBrand = computed(() => isCustomDomain.value && !!activeHoa.value);

const orgLogoUrl = computed(() => {
  const org = activeHoa.value as any;
  const logo = org?.settings?.logo || org?.logo;
  if (!logo) return "";
  const id = typeof logo === "object" ? logo.id : logo;
  return `${config.public.directus.url}/assets/${id}?key=small-contain`;
});
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
      <!-- Brand mark — the tenant's org on a custom domain, else HOAConnect -->
      <div class="mb-8 flex flex-col items-center gap-2 text-center">
        <template v-if="showOrgBrand">
          <NuxtLink to="/" class="flex flex-col items-center gap-2 transition hover:opacity-80">
            <img
              v-if="orgLogoUrl"
              :src="orgLogoUrl"
              :alt="(activeHoa as any)?.name || ''"
              class="h-12 w-auto max-w-[14rem] object-contain"
            />
            <span v-else class="font-serif text-2xl t-text">{{ (activeHoa as any)?.name }}</span>
          </NuxtLink>
          <span class="text-[11px] uppercase tracking-extra-wide t-text-muted">
            Resident portal
          </span>
        </template>
        <NuxtLink v-else to="/" class="transition hover:opacity-80">
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
