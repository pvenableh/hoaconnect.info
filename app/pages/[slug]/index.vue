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

    <!-- Organization Landing Page -->
    <div v-else>
      <!-- Hero Section -->
      <div
        class="min-h-screen bg-white bg-cover bg-center bg-no-repeat flex items-center justify-center flex-col relative"
        style="
          background-image: url(https://admin.605lincolnroad.com/assets/cd403a2c-f326-461d-9f8a-5adf7560bfb4);
        "
      >
        <div
          ref="heroTitle"
          class="uppercase flex items-center justify-center flex-col px-4 sm:px-12 max-w-4xl w-full"
        >
          <img
            src="https://admin.605lincolnroad.com/assets/e0b855bc-01ad-4773-b91b-5ec9d7090ae7?key=large-contain"
            alt="605 Lincoln Road"
            class="w-full h-auto drop-shadow-2xl"
          />
          <p
            class="text-center tracking-[0.75em] text-white uppercase text-[4.75vw] sm:text-[4vw] md:text-[28px] mt-20 hue-text-gradient font-bold text-shadow-2xl"
          >
            Coming soon
          </p>
        </div>
      </div>

      <section
        class="relative bg-gradient-to-br from-blue-600 to-blue-800 text-white"
      >
        <div class="container mx-auto px-4 py-20 lg:py-32">
          <div class="max-w-4xl mx-auto text-center">
            <!-- Organization Logo -->
            <div v-if="organization?.logo" class="mb-8">
              <img
                :src="getFileUrl(organization.logo)"
                :alt="organization.name"
                class="w-32 h-32 mx-auto object-contain bg-white rounded-full p-4 shadow-xl"
              />
            </div>

            <!-- Organization Name -->
            <h1 class="text-5xl lg:text-6xl font-bold mb-6">
              {{ organization?.name }}
            </h1>

            <!-- Address -->
            <div class="text-xl lg:text-2xl text-blue-100 mb-8">
              <p class="mb-2">{{ organization?.street_address }}</p>
              <p>
                {{ organization?.city }}, {{ organization?.state }}
                {{ organization?.zip }}
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
        v-if="
          organization?.settings?.description || organization?.settings?.about
        "
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
                {{
                  organization.settings.description ||
                  organization.settings.about
                }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Amenities Section -->
      <section
        v-if="organization?.amenities && organization.amenities.length > 0"
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
                v-for="amenity in organization.amenities"
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
                v-if="organization?.phone"
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
                  :href="`tel:${organization.phone}`"
                  class="text-2xl font-bold hover:text-blue-200 transition"
                >
                  {{ organization.phone }}
                </a>
              </div>

              <!-- Email Card -->
              <div
                v-if="organization?.email"
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
                  :href="`mailto:${organization.email}`"
                  class="text-2xl font-bold hover:text-blue-200 transition break-all"
                >
                  {{ organization.email }}
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
const route = useRoute();
const { user } = useDirectusAuth();
const config = useRuntimeConfig();

// Get slug from route params
const slug = computed(() => route.params.slug);

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
