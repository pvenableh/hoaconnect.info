<template>
  <div class="min-h-screen bg-gradient-to-b from-blue-50 to-white">
    <!-- Main Domain - Logged In User: Redirect to dashboard -->
    <div v-if="isMainDomain && user" class="container mx-auto px-4 py-12">
      <div class="max-w-3xl mx-auto text-center py-20">
        <h2 class="text-4xl font-bold text-gray-900 mb-6">
          Welcome back, {{ user.firstName }}!
        </h2>
        <p class="text-xl text-gray-600 mb-8">
          You're all set. Head to your dashboard to manage your HOA.
        </p>
        <NuxtLink
          to="/dashboard"
          class="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition shadow-lg"
        >
          Go to Dashboard
        </NuxtLink>
      </div>
    </div>

    <!-- Main Domain - Public: Marketing Page -->
    <div v-else-if="isMainDomain && !user" class="container mx-auto px-4 py-12">
      <!-- Hero Section -->
      <section class="pt-20 pb-16 px-4">
        <div class="max-w-7xl mx-auto text-center">
          <h2 class="text-5xl font-bold text-gray-900 mb-6">
            Simplify Your HOA Management
          </h2>
          <p class="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Streamline document management, communications, and member access
            with our comprehensive HOA platform. Built for communities of all
            sizes.
          </p>
          <button
            @click="scrollToPlans"
            class="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition shadow-lg"
          >
            View Plans & Pricing
          </button>
        </div>
      </section>

      <!-- Features Overview -->
      <section id="features" class="py-16 bg-white">
        <div class="max-w-7xl mx-auto px-4">
          <h3 class="text-3xl font-bold text-center text-gray-900 mb-12">
            Everything Your HOA Needs
          </h3>
          <div class="grid md:grid-cols-3 gap-8">
            <div class="text-center p-6">
              <div
                class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h4 class="text-xl font-semibold text-gray-900 mb-2">
                Document Management
              </h4>
              <p class="text-gray-600">
                Organize, store, and share HOA documents securely with version
                control and access logging.
              </p>
            </div>

            <div class="text-center p-6">
              <div
                class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"
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
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              </div>
              <h4 class="text-xl font-semibold text-gray-900 mb-2">
                Role-Based Access
              </h4>
              <p class="text-gray-600">
                Control who sees what with granular permissions for board
                members, owners, and guests.
              </p>
            </div>

            <div class="text-center p-6">
              <div
                class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"
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
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <h4 class="text-xl font-semibold text-gray-900 mb-2">
                Announcements
              </h4>
              <p class="text-gray-600">
                Keep residents informed with community announcements and
                important updates.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Pricing Plans -->
      <section id="plans" class="py-20 bg-gray-50">
        <div class="max-w-7xl mx-auto px-4">
          <div class="text-center mb-16">
            <h3 class="text-4xl font-bold text-gray-900 mb-4">
              Choose Your Plan
            </h3>
            <p class="text-xl text-gray-600">
              Select the perfect solution for your HOA community
            </p>
          </div>

          <!-- Loading State -->
          <div v-if="pending" class="text-center py-12">
            <div
              class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"
            ></div>
            <p class="mt-4 text-gray-600">Loading plans...</p>
          </div>

          <!-- Error State -->
          <div v-else-if="error" class="text-center py-12">
            <p class="text-red-600">
              Error loading plans. Please try again later.
            </p>
          </div>

          <!-- Plans Grid -->
          <div
            v-else-if="activePlans && activePlans.length > 0"
            class="grid gap-8 max-w-6xl mx-auto"
            :class="[
              activePlans.length === 1
                ? 'md:grid-cols-1 max-w-md'
                : activePlans.length === 2
                  ? 'md:grid-cols-2'
                  : activePlans.length === 3
                    ? 'md:grid-cols-3'
                    : 'md:grid-cols-4',
            ]"
          >
            <div
              v-for="plan in activePlans"
              :key="plan.id"
              class="bg-white rounded-2xl shadow-lg p-8 border-2 transition relative"
              :class="[
                plan.is_featured
                  ? 'border-blue-500 transform md:scale-105'
                  : 'border-gray-200 hover:border-blue-400',
              ]"
            >
              <!-- Featured Badge -->
              <div
                v-if="plan.is_featured"
                class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
              >
                <span
                  class="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold"
                  >POPULAR</span
                >
              </div>

              <!-- Plan Header -->
              <div class="text-center mb-6">
                <h4 class="text-2xl font-bold text-gray-900 mb-2">
                  {{ plan.name }}
                </h4>
                <div class="text-4xl font-bold text-blue-600 mb-2">
                  ${{ formatPrice(plan.price_monthly) }}
                  <span class="text-lg text-gray-600">/mo</span>
                </div>
                <p class="text-gray-600">{{ plan.description }}</p>
                <p
                  v-if="plan.trial_days > 0"
                  class="text-sm text-green-600 mt-2 font-semibold"
                >
                  {{ plan.trial_days }}-day free trial
                </p>
              </div>

              <!-- Plan Features -->
              <ul class="space-y-3 mb-8">
                <li
                  v-for="(feature, index) in plan.features"
                  :key="index"
                  class="flex items-start"
                >
                  <svg
                    class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
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
                  <span>{{ feature }}</span>
                </li>

                <!-- Additional info -->
                <li v-if="plan.max_members" class="flex items-start">
                  <svg
                    class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
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
                  <span>Up to {{ plan.max_members }} members</span>
                </li>
                <li
                  v-if="!plan.max_members && plan.slug !== 'starter'"
                  class="flex items-start"
                >
                  <svg
                    class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
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
                  <span>Unlimited members</span>
                </li>

                <li v-if="plan.max_storage_gb" class="flex items-start">
                  <svg
                    class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
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
                  <span>{{ plan.max_storage_gb }}GB storage</span>
                </li>
                <li
                  v-if="!plan.max_storage_gb && plan.slug !== 'starter'"
                  class="flex items-start"
                >
                  <svg
                    class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
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
                  <span>Unlimited storage</span>
                </li>
              </ul>

              <!-- CTA Button -->
              <button
                @click="selectPlan(plan.slug)"
                class="w-full py-3 rounded-lg font-semibold transition"
                :class="[
                  plan.is_featured
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800',
                ]"
              >
                {{
                  plan.price_monthly === "0.00" ? "Start Free" : "Get Started"
                }}
              </button>
            </div>
          </div>

          <!-- No Plans State -->
          <div v-else class="text-center py-12">
            <p class="text-gray-600">No plans available at this time.</p>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="py-20 bg-blue-600">
        <div class="max-w-4xl mx-auto text-center px-4">
          <h3 class="text-4xl font-bold text-white mb-6">
            Ready to Transform Your HOA?
          </h3>
          <p class="text-xl text-blue-100 mb-8">
            Join communities already streamlining their operations with HOA
            Connect
          </p>
          <button
            @click="scrollToPlans"
            class="bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition shadow-lg"
          >
            Start Your Free Trial
          </button>
        </div>
      </section>
    </div>

    <!-- Custom Domain (605lincolnroad.com, etc) - Organization Landing Page -->
    <div v-else>
      <!-- Hero Section -->
      <section
        class="relative bg-gradient-to-br from-blue-600 to-blue-800 text-white"
      >
        <div class="container mx-auto px-4 py-20 lg:py-32">
          <div class="max-w-4xl mx-auto text-center">
            <!-- Organization Logo -->
            <div v-if="activeHoa?.logo" class="mb-8">
              <img
                :src="getFileUrl(activeHoa.logo)"
                :alt="activeHoa.name"
                class="w-32 h-32 mx-auto object-contain bg-white rounded-full p-4 shadow-xl"
              />
            </div>

            <!-- Organization Name -->
            <h1 class="text-5xl lg:text-6xl font-bold mb-6">
              {{ activeHoa?.name }}
            </h1>

            <!-- Address -->
            <div class="text-xl lg:text-2xl text-blue-100 mb-8">
              <p class="mb-2">{{ activeHoa?.street_address }}</p>
              <p>
                {{ activeHoa?.city }}, {{ activeHoa?.state }}
                {{ activeHoa?.zip }}
              </p>
            </div>

            <!-- Hero CTA -->
            <div class="flex flex-col sm:flex-row gap-4 justify-center mt-10">
              <a
                v-if="user"
                href="/dashboard"
                class="inline-block bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition shadow-lg"
              >
                Access Portal
              </a>

              <a
                v-else
                href="/login"
                class="inline-block bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition shadow-lg"
              >
                Resident Login
              </a>

              <a
                href="#contact"
                class="inline-block bg-blue-700 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-600 transition border-2 border-white"
              >
                Contact Us
              </a>
            </div>
          </div>
        </div>

        <!-- Decorative Wave -->
        <div class="absolute bottom-0 left-0 right-0">
          <svg
            viewBox="0 0 1440 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            class="w-full h-auto"
          >
            <path
              d="M0 0L60 10C120 20 240 40 360 46.7C480 53 600 47 720 43.3C840 40 960 40 1080 46.7C1200 53 1320 67 1380 73.3L1440 80V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0V0Z"
              fill="white"
            />
          </svg>
        </div>
      </section>

      <!-- About Section -->
      <section
        v-if="activeHoa?.settings?.description || activeHoa?.settings?.about"
        class="py-20 bg-white"
      >
        <div class="container mx-auto px-4">
          <div class="max-w-4xl mx-auto">
            <h2 class="text-4xl font-bold text-gray-900 mb-8 text-center">
              About Our Community
            </h2>
            <div
              class="prose prose-lg max-w-none text-gray-700 leading-relaxed"
            >
              <p>
                {{ activeHoa.settings.description || activeHoa.settings.about }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Amenities Section -->
      <section
        v-if="activeHoa?.amenities && activeHoa.amenities.length > 0"
        class="py-20 bg-gray-50"
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
        class="py-20 bg-gradient-to-br from-blue-600 to-blue-800 text-white"
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
    </div>
  </div>
</template>

<script setup>
const { activeHoa, isMainDomain, fetchActiveHoa } = useActiveHoa();
const { user } = useDirectusAuth();
const config = useRuntimeConfig();

// CRITICAL: Fetch HOA data server-side for SEO
await useAsyncData("active-hoa", async () => {
  return await fetchActiveHoa();
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

const formatPrice = (price) => {
  const numPrice = parseFloat(price);
  return numPrice % 1 === 0 ? numPrice.toFixed(0) : numPrice.toFixed(2);
};

const scrollToPlans = () => {
  if (process.client) {
    const plansSection = document.getElementById("plans");
    plansSection?.scrollIntoView({ behavior: "smooth" });
  }
};

const selectPlan = (planSlug) => {
  navigateTo(`/signup?plan=${planSlug}`);
};
</script>

<style scoped>
/* Add any additional custom styles here if needed */
</style>
