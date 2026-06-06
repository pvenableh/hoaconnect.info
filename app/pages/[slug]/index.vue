<template>
  <div class="min-h-screen">
    <!-- Loading State -->
    <div v-if="pending" class="flex items-center justify-center min-h-[400px]">
      <div class="text-center">
        <div
          class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
          role="status"
        >
          <span
            class="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]"
          >
            Loading...
          </span>
        </div>
        <p class="mt-4 text-gray-600">Loading organization...</p>
      </div>
    </div>

    <!-- Organization Not Found -->
    <div
      v-else-if="!organization"
      class="flex items-center justify-center min-h-[400px]"
    >
      <div class="text-center">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">
          Organization Not Found
        </h1>
        <p class="text-xl text-gray-600 mb-8">
          The organization you're looking for doesn't exist.
        </p>
        <a
          href="/"
          class="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition"
        >
          Go Home
        </a>
      </div>
    </div>

    <!-- Member Dashboard (for logged-in members who are not admins) -->
    <PagesMemberDashboardPage v-else-if="user && isMember" />

    <!-- Organization Public Landing Page (for public visitors or admins) -->
    <OrgPublicLanding v-else :organization="organization" :slug="slug" />
  </div>
</template>

<script setup>
const route = useRoute();
const { user } = useDirectusAuth();
const config = useRuntimeConfig();

// Get slug from route params
const slug = computed(() => route.params.slug);

// Get role info for logged-in users
const { isMember } = user.value
  ? await useSelectedOrg()
  : { isMember: ref(false) };

// Get admin status for current domain
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();

const heroTitle = ref(null);
use3DMouseRotation(heroTitle, {
  orbitalMode: true,
  intensity: 0.2,
  maxRotation: 6,
  ease: 0.12,
  perspective: 300,
  enableTranslation: true,
  orbitalDepth: 60,
  hoverScale: 1.05,
  resetOnLeave: true,
});

// Fetch organization by slug
const { data: organization, pending } = await useAsyncData(
  `organization-${slug.value}`,
  async () => {
    const response = await $fetch(`/api/hoa/find?slug=${slug.value}`);
    return response;
  }
);

// External landing mode: when the org hosts its public/marketing site elsewhere
// (settings → set external_url), HOA Connect's built-in landing is disabled and
// HOA Connect acts as the resident portal only. Public visitors go to the
// resident login; logged-in members fall through to their dashboard below.
const { buildOrgPath } = useOrgNavigation();
if (organization.value?.external_url && !(user.value && isMember.value)) {
  await navigateTo(
    user.value ? buildOrgPath("/dashboard") : "/auth/login",
    { replace: true }
  );
}

// Apply the org's per-tenant landing style (classic | modern | luxury). Stored
// on settings.theme; forceThemeStyle is SSR-safe (uses useHead) and does not
// persist to the visitor's preferences.
const { forceThemeStyle } = useTheme();
const VALID_LANDING_STYLES = ["classic", "modern", "luxury"];
watchEffect(() => {
  const style = organization.value?.settings?.theme;
  if (style && VALID_LANDING_STYLES.includes(style)) {
    forceThemeStyle(style);
  }
});

// Check if account is expired (not free and subscription is expired/canceled)
const isAccountExpired = computed(() => {
  if (!organization.value) return false;
  // Free accounts never expire
  if (organization.value.is_free_account) return false;
  // Check subscription status
  const status = organization.value.subscription_status;
  return status === 'expired' || status === 'canceled';
});

// Set dynamic meta tags based on organization
useSeoMeta({
  title: () =>
    organization.value
      ? `${organization.value.name} - HOA Community Portal`
      : "Organization Not Found",
  description: () =>
    organization.value?.settings?.description || "HOA Community Portal",
  ogTitle: () => organization.value?.name || "Organization",
  ogDescription: () =>
    organization.value?.settings?.description || "HOA Community Portal",
  ogImage: () =>
    organization.value?.logo
      ? `${config.public.directus.url}/assets/${organization.value.logo}`
      : "/og-image.jpg",
});

// Helper function to get Directus file URL
const getFileUrl = (file) => {
  if (!file) return "";
  const fileId = typeof file === "object" ? file.id : file;
  return `${config.public.directus.url}/assets/${fileId}`;
};
</script>
