<template>
  <div class="container mx-auto px-4 py-12 t-bg t-text">
    <!-- Logged-in user with org banner -->
    <div
      v-if="user && currentOrg?.organization?.slug"
      class="t-bg-accent t-text-inverse rounded-lg p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4"
    >
      <div class="flex items-center gap-3">
        <svg
          class="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
        <span class="font-medium"
          >Welcome back! You're a member of
          <strong>{{ currentOrg.organization.name }}</strong></span
        >
      </div>
      <a
        :href="getOrgUrl(currentOrg.organization)"
        class="t-bg-elevated t-text-accent px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition whitespace-nowrap"
      >
        Go to {{ currentOrg.organization.name }}
      </a>
    </div>
    <!-- Hero Section -->
    <section class="pt-20 pb-16 px-4">
      <div class="max-w-7xl mx-auto text-center">
        <h2 class="t-heading text-5xl font-bold t-text mb-6">
          Simplify Your HOA Management
        </h2>
        <p class="text-xl t-text-secondary mb-8 max-w-3xl mx-auto">
          Streamline document management, communications, and member access with
          our comprehensive HOA platform. Built for communities of all sizes.
        </p>
        <button
          @click="scrollToPlans"
          class="t-btn px-8 py-4 rounded-lg text-lg font-semibold transition shadow-lg"
        >
          View Plans & Pricing
        </button>
      </div>
    </section>

    <!-- Features Overview -->
    <section id="features" class="py-16 t-bg-elevated">
      <div class="max-w-7xl mx-auto px-4">
        <h3 class="t-heading text-3xl font-bold text-center t-text mb-12">
          Everything Your HOA Needs
        </h3>
        <div class="grid md:grid-cols-3 gap-8">
          <div class="text-center p-6">
            <div
              class="w-16 h-16 t-bg-alt rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <svg
                class="w-8 h-8 t-text-accent"
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
            <h4 class="t-heading text-xl font-semibold t-text mb-2">
              Document Management
            </h4>
            <p class="t-text-secondary">
              Organize, store, and share HOA documents securely with version
              control and access logging.
            </p>
          </div>

          <div class="text-center p-6">
            <div
              class="w-16 h-16 t-bg-alt rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <svg
                class="w-8 h-8 t-text-accent"
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
            <h4 class="t-heading text-xl font-semibold t-text mb-2">
              Role-Based Access
            </h4>
            <p class="t-text-secondary">
              Control who sees what with granular permissions for board members,
              owners, and guests.
            </p>
          </div>

          <div class="text-center p-6">
            <div
              class="w-16 h-16 t-bg-alt rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <svg
                class="w-8 h-8 t-text-accent"
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
            <h4 class="t-heading text-xl font-semibold t-text mb-2">
              Announcements
            </h4>
            <p class="t-text-secondary">
              Keep residents informed with community announcements and important
              updates.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Plans -->
    <section id="plans" class="py-20 t-bg-alt">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16">
          <h3 class="t-heading text-4xl font-bold t-text mb-4">
            Choose Your Plan
          </h3>
          <p class="text-xl t-text-secondary">
            Select the perfect solution for your HOA community
          </p>
        </div>

        <!-- Loading State -->
        <div v-if="pending" class="text-center py-12">
          <div
            class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 t-border-accent"
          ></div>
          <p class="mt-4 t-text-secondary">Loading plans...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12">
          <p class="text-red-600">
            Error loading plans. Please try again later.
          </p>
        </div>

        <!-- Plans Grid -->
        <div
          v-else-if="plans && plans.length > 0"
          class="grid gap-8 max-w-6xl mx-auto"
          :class="[
            plans.length === 1
              ? 'md:grid-cols-1 max-w-md'
              : plans.length === 2
                ? 'md:grid-cols-2'
                : plans.length === 3
                  ? 'md:grid-cols-3'
                  : 'md:grid-cols-4',
          ]"
        >
          <div
            v-for="plan in plans"
            :key="plan.id"
            class="t-bg-elevated rounded-2xl theme-shadow-lg p-8 border-2 transition relative"
            :class="[
              plan.is_featured
                ? 't-border-accent transform md:scale-105'
                : 't-border hover:t-border-accent',
            ]"
          >
            <!-- Featured Badge -->
            <div
              v-if="plan.is_featured"
              class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
            >
              <span
                class="t-bg-accent t-text-inverse px-4 py-1 rounded-full text-sm font-semibold"
                >POPULAR</span
              >
            </div>

            <!-- Plan Header -->
            <div class="text-center mb-6">
              <h4 class="t-heading text-2xl font-bold t-text mb-2">
                {{ plan.name }}
              </h4>
              <div class="text-4xl font-bold t-text-accent mb-2">
                ${{ formatPrice(plan.price_monthly) }}
                <span class="text-lg t-text-secondary">/mo</span>
              </div>
              <p class="t-text-secondary">{{ plan.description }}</p>
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
                <Icon
                  name="i-lucide-check"
                  class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
                />
                <span class="t-text-secondary">{{ feature }}</span>
              </li>

              <!-- Additional info -->
              <li v-if="plan.max_members" class="flex items-start">
                <Icon
                  name="i-lucide-check"
                  class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
                />
                <span class="t-text-secondary">Up to {{ plan.max_members }} members</span>
              </li>
              <li
                v-if="!plan.max_members && plan.slug !== 'starter'"
                class="flex items-start"
              >
                <Icon
                  name="i-lucide-check"
                  class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
                />
                <span class="t-text-secondary">Unlimited members</span>
              </li>

              <li v-if="plan.max_storage_gb" class="flex items-start">
                <Icon
                  name="i-lucide-check"
                  class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
                />
                <span class="t-text-secondary">{{ plan.max_storage_gb }}GB storage</span>
              </li>
              <li
                v-if="!plan.max_storage_gb && plan.slug !== 'starter'"
                class="flex items-start"
              >
                <Icon
                  name="i-lucide-check"
                  class="w-6 h-6 text-green-500 mr-2 flex-shrink-0"
                />
                <span class="t-text-secondary">Unlimited storage</span>
              </li>
            </ul>

            <!-- CTA Button -->
            <button
              @click="selectPlan(plan.slug)"
              class="w-full py-3 rounded-lg font-semibold transition"
              :class="[
                plan.is_featured
                  ? 't-btn'
                  : 't-bg-subtle t-text hover:opacity-80',
              ]"
            >
              {{ plan.price_monthly === "0.00" ? "Start Free" : "Get Started" }}
            </button>
          </div>
        </div>

        <!-- No Plans State -->
        <div v-else class="text-center py-12">
          <p class="t-text-secondary">No plans available at this time.</p>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-20 t-bg-accent">
      <div class="max-w-4xl mx-auto text-center px-4">
        <h3 class="t-heading text-4xl font-bold t-text-inverse mb-6">
          Ready to Transform Your HOA?
        </h3>
        <p class="text-xl t-text-inverse opacity-80 mb-8">
          Join communities already streamlining their operations with HOA
          Connect
        </p>
        <button
          @click="scrollToPlans"
          class="t-bg-elevated t-text-accent px-8 py-4 rounded-lg text-lg font-semibold hover:opacity-90 transition shadow-lg"
        >
          Start Your Free Trial
        </button>
      </div>
    </section>
  </div>
</template>
<script setup>
const { user } = useDirectusAuth();
const { currentOrg } = await useSelectedOrg();
const { forceThemeStyle } = useTheme();

// Force Classic theme for the sell-sheet/marketing page
// Called at setup time (not in onMounted) so it works with SSR
forceThemeStyle('classic');

const props = defineProps({
  plans: {
    type: Array,
    required: false,
    default: () => [],
  },
  error: {
    type: String,
    required: false,
    default: null,
  },
  pending: {
    type: Boolean,
    required: false,
    default: false,
  },
});

// Helper function to get organization URL (custom domain or slug path)
const getOrgUrl = (org) => {
  if (!org) return "/";
  if (org.custom_domain && org.domain_verified) {
    // Use custom domain
    const protocol = import.meta.client ? window.location.protocol : "https:";
    return `${protocol}//${org.custom_domain}`;
  }
  // Fall back to slug path
  return `/${org.slug}`;
};

const formatPrice = (price) => {
  const numPrice = parseFloat(price);
  return numPrice % 1 === 0 ? numPrice.toFixed(0) : numPrice.toFixed(2);
};

const scrollToPlans = () => {
  if (import.meta.client) {
    const plansSection = document.getElementById("plans");
    plansSection?.scrollIntoView({ behavior: "smooth" });
  }
};

const selectPlan = (planSlug) => {
  navigateTo(`/setup?plan=${planSlug}`);
};
</script>
