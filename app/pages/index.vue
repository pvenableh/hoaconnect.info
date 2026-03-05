<template>
  <div class="min-h-screen t-bg t-text">
    <!-- Main Domain: Marketing Page (for all users, logged in or not) -->
    <!-- Only show on main domain AND not on custom domain -->
    <PagesSellSheet
      v-if="isMainDomain && !isCustomDomain"
      :plans="activePlans"
      :error="error"
      :pending="pending"
    />

    <!-- Custom Domain (605lincolnroad.com, etc) - Organization Landing Page -->
    <div v-else>
      <!-- Maintenance Mode Banner for Admins -->
      <div
        v-if="activeHoa?.maintenance_mode && isAdminOfCurrentDomain"
        class="bg-amber-500 text-white py-2 px-4 text-center font-medium text-sm sticky top-0 z-50"
      >
        <Icon name="lucide:wrench" class="w-4 h-4 inline-block mr-2" />
        Maintenance Mode - This content is hidden from public visitors
      </div>
      <!-- Hero Section -->
      <section
        class="min-h-screen bg-cover bg-center bg-no-repeat flex items-center justify-center flex-col relative"
        :class="{
          'bg-gradient-to-b from-black/70 via-black/50 to-black/90 bg-blend-darken':
            activeHoa?.hero?.background_image,
        }"
        :style="
          activeHoa?.hero?.background_image
            ? {
                backgroundImage:
                  'url(https://admin.hoaconnect.info/assets/' +
                  activeHoa.hero.background_image.id +
                  ')',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
              }
            : null
        "
      >
        <div
          ref="heroTitle"
          class="uppercase flex items-center justify-center flex-col px-4 sm:px-12 max-w-4xl w-full"
        >
          <div v-if="activeHoa?.hero?.foreground_image" class="mb-8">
            <img
              :src="getFileUrl(activeHoa.hero.foreground_image)"
              :alt="activeHoa.name"
              class="mx-auto object-contain w-full h-auto drop-shadow-2xl"
            />
          </div>
          <div v-else-if="activeHoa?.logo" class="mb-8">
            <img
              :src="getFileUrl(activeHoa.logo)"
              :alt="activeHoa.name"
              class="mx-auto object-contain w-full h-auto drop-shadow-2xl"
            />
          </div>
          <h1
            v-else-if="activeHoa?.hero?.title"
            class="text-5xl text-white font-light tracking-ultra-wide uppercase mb-6"
          >
            {{ activeHoa?.hero?.title }}
          </h1>
          <!-- Organization Name -->
          <h1
            v-else
            class="text-5xl text-white font-light tracking-ultra-wide uppercase mb-6"
          >
            {{ activeHoa?.name }}
          </h1>
          <h5
            v-if="activeHoa?.hero?.subtitle"
            class="text-sm text-white/75 mb-8 uppercase tracking-ultra-wide"
          >
            {{ activeHoa.hero.subtitle }}
          </h5>

          <!-- Address -->
          <h5
            v-else-if="activeHoa?.street_address"
            class="text-sm text-white/75 mb-8 uppercase tracking-ultra-wide"
          >
            {{ activeHoa?.street_address }} {{ activeHoa?.city }},
            {{ activeHoa?.state }} {{ activeHoa?.zip }}
          </h5>
          <!-- Under Construction Message (shown when in maintenance mode for non-admins) -->
          <p
            v-if="activeHoa?.maintenance_mode && !isAdminOfCurrentDomain"
            class="text-lg glass-container tracking-extra-wide mt-8 text-white px-6 py-3"
          >
            The site is currently under construction
          </p>

          <!-- Account Expired Message (shown when subscription is expired/canceled and not a free account) -->
          <div v-else-if="isAccountExpired" class="mt-8 text-center">
            <p
              class="text-lg glass-container tracking-extra-wide mt-8 px-6 py-3 text-red-500/80 mb-4"
            >
              This account has expired
            </p>
            <a
              href="/auth/login"
              class="inline-block glass-container tracking-extra-wide text-sm text-white hover:bg-white/20 transition"
            >
              Login here to renew your account
            </a>
          </div>

          <div
            v-if="
              (!activeHoa?.maintenance_mode || isAdminOfCurrentDomain) &&
              !isAccountExpired
            "
            class="flex flex-col sm:flex-row gap-4 justify-center mt-10"
          >
            <a
              v-if="user"
              href="/dashboard"
              class="inline-block glass-container tracking-extra-wide text-sm text-white"
            >
              Resident Portal
            </a>

            <a
              v-else
              href="/auth/login"
              class="inline-block glass-container tracking-extra-wide text-sm text-white"
            >
              Resident Login
            </a>

            <a
              href="#contact"
              class="inline-block glass-container tracking-extra-wide text-sm text-white"
            >
              Contact Us
            </a>
          </div>
        </div>
      </section>

      <!-- Content Sections (hidden in maintenance mode for non-admins, or when account is expired) -->
      <template
        v-if="
          (!activeHoa?.maintenance_mode || isAdminOfCurrentDomain) &&
          !isAccountExpired
        "
      >
        <!-- About Section -->
        <section
          v-if="activeHoa?.settings?.description || activeHoa?.settings?.about"
          class="py-20 bg-white"
        >
          <div class="container mx-auto px-4">
            <div class="max-w-4xl mx-auto">
              <h2 class="text-4xl text-gray-900 mb-8 text-center uppercase">
                About Our Community
              </h2>
              <div
                class="prose prose-lg max-w-none text-gray-700 leading-relaxed"
              >
                <p>
                  {{
                    activeHoa.settings.description || activeHoa.settings.about
                  }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Amenities Section -->
        <section
          v-if="activeHoa?.amenities && activeHoa.amenities.length > 0"
          class="py-20 bg-gray-50 hidden"
        >
          <div class="container mx-auto px-4">
            <div class="max-w-6xl mx-auto">
              <h2 class="text-4xl font-bold text-gray-900 mb-4 text-center">
                Community Amenities
              </h2>
              <p class="text-xl text-gray-600 mb-12 text-center">
                Enjoy the exclusive features available to our residents
              </p>

              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div
                  v-for="amenity in activeHoa.amenities"
                  :key="amenity.id"
                  class="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow"
                >
                  <!-- Amenity Icon -->
                  <div
                    class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6"
                  >
                    <svg
                      class="w-8 h-8 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>

                  <h3 class="text-2xl font-bold text-gray-900 mb-3">
                    {{ amenity.title }}
                  </h3>
                  <p class="text-gray-600 leading-relaxed">
                    {{ amenity.description }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Contact CTA Section -->
        <section
          id="contact"
          class="py-20 bg-gradient-to-br from-blue-600 to-blue-800 text-white hidden"
        >
          <div class="container mx-auto px-4">
            <div class="max-w-4xl mx-auto text-center">
              <h2 class="text-4xl lg:text-5xl font-bold mb-6">Get in Touch</h2>
              <p class="text-xl text-blue-100 mb-12">
                Have questions or need assistance? Our community management team
                is here to help.
              </p>

              <!-- Contact Information Cards -->
              <div class="grid md:grid-cols-2 gap-6 mb-12">
                <!-- Phone Card -->
                <div
                  v-if="activeHoa?.phone"
                  class="bg-white/10 backdrop-blur-lg rounded-xl p-8 border border-white/20"
                >
                  <div
                    class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <svg
                      class="w-8 h-8 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                  </div>
                  <h3 class="text-xl font-semibold mb-2">Call Us</h3>

                  <a
                    :href="`tel:${activeHoa.phone}`"
                    class="text-2xl font-bold hover:text-blue-200 transition"
                  >
                    {{ activeHoa.phone }}
                  </a>
                </div>

                <!-- Email Card -->
                <div
                  v-if="activeHoa?.email"
                  class="bg-white/10 backdrop-blur-lg rounded-xl p-8 border border-white/20"
                >
                  <div
                    class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <svg
                      class="w-8 h-8 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h3 class="text-xl font-semibold mb-2">Email Us</h3>

                  <a
                    :href="`mailto:${activeHoa.email}`"
                    class="text-2xl font-bold hover:text-blue-200 transition break-all"
                  >
                    {{ activeHoa.email }}
                  </a>
                </div>
              </div>

              <!-- Additional CTA Button -->
              <div v-if="!user" class="mt-8">
                <a
                  href="/signup"
                  class="inline-block bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition shadow-lg"
                >
                  Become a Resident
                </a>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
const { activeHoa, isMainDomain, isCustomDomain } = useActiveHoa();
const { user } = useDirectusAuth();
const { currentOrg } = await useSelectedOrg();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { forceThemeStyle } = useTheme();
const config = useRuntimeConfig();

// Force Classic theme for the main landing page (SSR-compatible)
forceThemeStyle('classic');

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

// Set dynamic meta tags based on active HOA
useSeoMeta({
  title: () =>
    activeHoa.value
      ? `${activeHoa.value.name} - HOA Community Portal`
      : "HOA Connect - Simplify Your HOA Management",
  description: () =>
    activeHoa.value?.settings?.description ||
    "Streamline document management, communications, and member access with our comprehensive HOA platform.",
  ogTitle: () => activeHoa.value?.name || "HOA Connect",
  ogDescription: () =>
    activeHoa.value?.settings?.description || "HOA Management Platform",
  ogImage: () =>
    activeHoa.value?.logo
      ? `${config.public.directus.url}/assets/${activeHoa.value.logo}`
      : "/og-image.jpg",
});

// Helper function to get Directus file URL
const getFileUrl = (file) => {
  if (!file) return "";
  const fileId = typeof file === "object" ? file.id : file;
  return `${config.public.directus.url}/assets/${fileId}`;
};

// Subscription plans (only fetch if on main domain)
const { list } = useDirectusItems("subscription_plans", { requireAuth: false });
const {
  data: plans,
  pending,
  error,
} = await useAsyncData(
  "subscription-plans",
  async () => {
    // Only fetch plans on main domain
    if (!isMainDomain.value) {
      return [];
    }

    return await list({
      fields: ["*"],
      filter: {
        status: { _eq: "published" },
        is_active: { _eq: true },
      },
      sort: ["sort"],
    });
  },
  {
    server: true,
    lazy: false,
  }
);

const activePlans = computed(() => {
  if (!plans.value) return [];
  return plans.value.filter(
    (plan) => plan.is_active && plan.status === "published"
  );
});

// Check if account is expired (not free and subscription is expired/canceled)
const isAccountExpired = computed(() => {
  if (!activeHoa.value) return false;
  // Free accounts never expire
  if (activeHoa.value.is_free_account) return false;
  // Check subscription status
  const status = activeHoa.value.subscription_status;
  return status === "expired" || status === "canceled";
});
</script>

<style scoped>
/* Add any additional custom styles here if needed */
</style>
