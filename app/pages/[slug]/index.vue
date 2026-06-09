<template>
  <div class="min-h-screen t-bg">
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
        <p class="mt-4 t-text-secondary">Loading organization...</p>
      </div>
    </div>

    <!-- Organization Not Found -->
    <div
      v-else-if="!organization"
      class="flex items-center justify-center min-h-[400px]"
    >
      <div class="text-center">
        <h1 class="text-4xl font-bold t-text mb-4">
          Organization Not Found
        </h1>
        <p class="text-xl t-text-secondary mb-8">
          The organization you're looking for doesn't exist.
        </p>
        <a
          href="/"
          class="inline-block t-bg-accent t-text-inverse px-8 py-3 rounded-lg text-lg font-semibold hover:opacity-90 transition"
        >
          Go Home
        </a>
      </div>
    </div>

    <!-- Loaded org -->
    <template v-else>
      <!-- The "previewing member view" banner now lives in the auth layout so it
           persists across every workspace page (see app/layouts/auth.vue). -->

      <!-- Admin workspace at the clean root (role-aware home) -->
      <PagesDashboardPage
        v-if="isWorkspaceUser && isAdminOfCurrentDomain && !previewAsMember"
      />

      <!-- Member workspace at the clean root (also the admin "view as member" preview) -->
      <PagesMemberDashboardPage v-else-if="isWorkspaceUser" />

      <!-- Public landing — visitors, and any logged-in user via ?preview -->
      <OrgPublicLanding v-else :organization="organization" :slug="slug" />
    </template>
  </div>
</template>

<script setup>
const route = useRoute();
const { user } = useDirectusAuth();
const config = useRuntimeConfig();

// Get slug from route params
const slug = computed(() => route.params.slug);

// Ensure this user's memberships are loaded so the current-domain role checks
// below resolve (they read the shared "user-members" state).
if (user.value) await useSelectedOrg();

// Role within the org being VIEWED (the slug) — not the user's selected org.
const { isMemberOfCurrentDomain, isAdminOfCurrentDomain } =
  useCurrentDomainAccess();

// "?preview" lets any logged-in user view the public landing (the org's front
// door) even though their clean root normally renders their own workspace.
const forcePublic = computed(() => route.query.preview !== undefined);

// "View as member" lets an admin of this org see exactly what a logged-in resident
// sees (the member dashboard). It's a sticky mode (useViewAs) so it persists as the
// admin navigates — `?as=member` is just the entry point that flips it on.
const { isPreviewingMember } = useViewAs();
const previewAsMember = computed(
  () =>
    isAdminOfCurrentDomain.value &&
    (isPreviewingMember.value || route.query.as === "member")
);

// A logged-in member/admin of THIS org gets their workspace at the clean root —
// no "/dashboard" suffix, which keeps APEX custom-domain URLs pristine
// (605lincolnroad.com/ === your dashboard). Everyone else sees the landing.
const isWorkspaceUser = computed(
  () =>
    !!user.value &&
    !forcePublic.value &&
    (isMemberOfCurrentDomain.value || isAdminOfCurrentDomain.value)
);

// Workspace users get the full app shell (nav + dock + breadcrumbs + banner) via
// the `auth` layout. Visitors and the public-site preview get the self-contained,
// chromeless landing (its own nav drawer + CTAs).
setPageLayout(isWorkspaceUser.value ? "auth" : "auth-blank");

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
if (
  organization.value?.external_url &&
  !isWorkspaceUser.value &&
  !forcePublic.value
) {
  // Built-in landing disabled for this org. Workspace users render their
  // dashboard inline (above); a logged-in non-member is sent to the slug-agnostic
  // `/dashboard` entry (resolves to THEIR org's clean root), visitors to login.
  // `?preview` opts out so an admin can still inspect the built-in landing.
  await navigateTo(user.value ? "/dashboard" : "/auth/login", { replace: true });
}

// Apply the org's per-tenant landing style (classic | modern | luxury). Stored
// on settings.theme; forceThemeStyle is SSR-safe (uses useHead) and does not
// persist to the visitor's preferences.
const { forceThemeStyle } = useTheme();
const VALID_LANDING_STYLES = ["classic", "modern", "luxury"];
watchEffect(() => {
  // Only force the theme for the PUBLIC LANDING. When a workspace user renders
  // here (the clean-root dashboard / member preview, in the `auth` layout), that
  // layout owns the <html> theme — forcing it here would register a second,
  // competing class and reset the light/dark mode to its default.
  if (isWorkspaceUser.value) return;
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
