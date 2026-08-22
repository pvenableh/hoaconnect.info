<template>
  <div class="min-h-screen t-bg t-text">
    <!--
      Marketing FIRST, before the loading branch. It depends on the Host alone,
      never on the org lookup, and putting it after `v-if="pending"` made SSR and
      client disagree: the server resolves nothing for this host so pending is
      already false and it renders the landing, while the client starts with
      pending true and renders the spinner. That structural mismatch made Vue
      abandon hydration and leave dead SSR markup — the page looked right and was
      completely inert.
    -->
    <MarketingLanding v-if="isMarketing" />

    <!-- Loading -->
    <div v-else-if="pending" class="flex items-center justify-center min-h-screen">
      <div
        class="h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"
        role="status"
      />
    </div>

    <!--
      A verified custom domain's clean root (e.g. www.605lincolnroad.com) renders
      the org's public landing here — same component as /{slug}. The main app
      host never reaches this: the rootRedirect middleware below sends it to
      login/dashboard, and the marketing apex renders <MarketingLanding> above.
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
import { isMarketingHost } from "#core/shared/domains/host";

definePageMeta({
  // Chromeless: a custom domain's clean root only ever renders the org's public
  // landing (or a not-found) — no HOA Connect app header/footer. The marketing
  // landing supplies its own theme + shell, so one layout covers all three.
  layout: "auth-blank",
  middleware: [
    function rootRedirect() {
      // On the main app host, the root is not a public page — route visitors
      // into the app. Custom domains have isCustomDomain=true (set from the
      // request Host by domain-detector.global, which runs before page
      // middleware) and fall through to render the org landing below.
      const isCustomDomain = useState("isCustomDomain", () => false);
      if (isCustomDomain.value) return;

      // The apex is the marketing site, for signed-in visitors too — it is the
      // public front door, not an app route. The product lives at /dashboard,
      // /{slug}, and the org subdomains on this same host.
      const host = import.meta.client
        ? window.location.host
        : useRequestURL({ xForwardedHost: true }).host;
      // The apex is public: fall through and render <MarketingLanding>, which
      // brings its own theme class and shell. Deliberately NOT setPageLayout()
      // here — switching the layout mid-middleware remounts the page component,
      // and the landing's GSAP intro reverts itself on unmount, so the hero
      // silently stayed at opacity 0.
      if (isMarketingHost(host, useRuntimeConfig().public.mainDomain)) return;

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
  // Nothing to resolve on the marketing host — it is never a tenant.
  if (isMarketingHost(host, useRuntimeConfig().public.mainDomain)) return null;
  try {
    const resolved = await $fetch("/api/hoa/by-domain", { query: { host } });
    if (!resolved?.slug) return null;
    const org = await $fetch(`/api/hoa/find?slug=${resolved.slug}`);
    return org ? { org, slug: resolved.slug } : null;
  } catch {
    return null;
  }
});

// Host decides which of the three roots this is: marketing, an org's landing,
// or a not-found. Computed the same way on SSR and client so hydration agrees.
const requestHost = import.meta.client
  ? window.location.host
  : useRequestURL({ xForwardedHost: true }).host;
const isMarketing = computed(() =>
  isMarketingHost(requestHost, config.public.mainDomain)
);

const organization = computed(() => data.value?.org ?? null);
const orgSlug = computed(() => data.value?.slug ?? "");

// Apply the org's per-tenant landing style (classic | modern | luxury), default
// classic, plus its light/dark mode from `settings.landing.mode`.
// forceThemeStyle is SSR-safe and doesn't persist visitor prefs.
const { forceThemeStyle } = useTheme();
const VALID_LANDING_STYLES = ["classic", "modern", "luxury"];
const landingMode = computed<"light" | "dark">(() =>
  organization.value?.settings?.landing?.mode === "dark" ? "dark" : "light"
);
watchEffect(() => {
  const style = organization.value?.settings?.theme;
  forceThemeStyle(VALID_LANDING_STYLES.includes(style) ? style : "classic", landingMode.value);
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
