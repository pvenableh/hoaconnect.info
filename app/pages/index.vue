<template>
  <div class="min-h-screen t-bg t-text">
    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center min-h-screen">
      <div
        class="h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"
        role="status"
      />
    </div>

    <!--
      A verified custom domain's clean root (e.g. www.605lincolnroad.com) renders
      the org's public landing here — same component as /{slug}. The main app
      host never reaches this: the rootRedirect middleware below sends it to
      login/dashboard. (Platform marketing lives in the separate
      hoaconnect-marketing project — see docs/plan-marketing-split.md.)
    -->
    <OrgPublicLanding
      v-else-if="organization"
      :organization="organization"
      :slug="orgSlug"
    />

    <!-- Custom domain that didn't resolve to an org -->
    <div v-else class="flex items-center justify-center min-h-screen px-6 text-center">
      <div>
        <h1 class="font-serif text-4xl t-text mb-3">Not found</h1>
        <p class="t-text-secondary">This address isn’t connected to a community.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  // Chromeless: a custom domain's clean root only ever renders the org's public
  // landing (or a not-found) — no HOA Connect app header/footer.
  layout: "auth-blank",
  middleware: [
    function rootRedirect() {
      // On the main app host, the root is not a public page — route visitors
      // into the app. Custom domains have isMainDomain=false (set by
      // domain-detector.global, which runs before page middleware) and fall
      // through to render the org landing below.
      const isMainDomain = useState("isMainDomain", () => true);
      if (!isMainDomain.value) return;

      const { loggedIn } = useUserSession();
      // Logged-in → /dashboard (org-redirect.global carries on to /{slug}).
      return navigateTo(loggedIn.value ? "/dashboard" : "/auth/login");
    },
  ],
});

const config = useRuntimeConfig();

// Resolve the org from the request Host (custom domain), then load it. Runs on
// SSR and client identically, so there's no hydration mismatch and the URL
// stays clean (no /{slug} in the address bar).
const { data, pending } = await useAsyncData("custom-domain-landing", async () => {
  const host = import.meta.client
    ? window.location.host
    : useRequestURL({ xForwardedHost: true }).host;
  try {
    const resolved = await $fetch("/api/hoa/by-domain", { query: { host } });
    if (!resolved?.slug) return null;
    const org = await $fetch(`/api/hoa/find?slug=${resolved.slug}`);
    return org ? { org, slug: resolved.slug } : null;
  } catch {
    return null;
  }
});

const organization = computed(() => data.value?.org ?? null);
const orgSlug = computed(() => data.value?.slug ?? "");

// Apply the org's per-tenant landing style (classic | modern | luxury), default
// classic. forceThemeStyle is SSR-safe and doesn't persist visitor prefs.
const { forceThemeStyle } = useTheme();
const VALID_LANDING_STYLES = ["classic", "modern", "luxury"];
watchEffect(() => {
  const style = organization.value?.settings?.theme;
  forceThemeStyle(VALID_LANDING_STYLES.includes(style) ? style : "classic");
});

useSeoMeta({
  title: () =>
    organization.value
      ? `${organization.value.name} - HOA Community Portal`
      : "HOA Connect",
  description: () =>
    organization.value?.settings?.description || "HOA Community Portal",
  ogTitle: () => organization.value?.name || "HOA Connect",
  ogDescription: () =>
    organization.value?.settings?.description || "HOA Community Portal",
  ogImage: () =>
    organization.value?.logo
      ? `${config.public.directus.url}/assets/${organization.value.logo}`
      : "/og-image.jpg",
});
</script>
