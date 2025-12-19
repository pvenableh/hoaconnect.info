<script setup lang="ts">
// Board page for custom domains (e.g., 605lincolnroad.com/board)
// Uses activeHoa from custom domain context instead of slug param
const config = useRuntimeConfig();

// Get active HOA from custom domain context
const { activeHoa, isCustomDomain } = useActiveHoa();

// Fetch board members using activeHoa slug
const { data: boardData, pending: boardPending } = await useAsyncData(
  `board-members-custom-domain`,
  async () => {
    if (!activeHoa.value?.slug) return null;
    const response = await $fetch(`/api/hoa/board-members?slug=${activeHoa.value.slug}`);
    return response;
  },
  { watch: [activeHoa] }
);

const boardMembers = computed(() => boardData.value?.boardMembers || []);

// Helper function to get Directus file URL
const getFileUrl = (file: any) => {
  if (!file) return "";
  const fileId = typeof file === "object" ? file.id : file;
  return `${config.public.directus.url}/assets/${fileId}`;
};

// Get org logo URL
const orgLogoUrl = computed(() => {
  const logoId = activeHoa.value?.logo;
  if (!logoId) return null;
  const fileId = typeof logoId === "string" ? logoId : logoId?.id;
  if (!fileId) return null;
  return `${config.public.directus.url}/assets/${fileId}?key=medium-contain`;
});

// Set dynamic meta tags
useSeoMeta({
  title: () =>
    activeHoa.value
      ? `Board of Directors - ${activeHoa.value.name}`
      : "Board of Directors",
  description: () =>
    `Meet the board of directors for ${activeHoa.value?.name || "our community"}`,
  ogTitle: () =>
    activeHoa.value
      ? `Board of Directors - ${activeHoa.value.name}`
      : "Board of Directors",
  ogDescription: () =>
    `Meet the board of directors for ${activeHoa.value?.name || "our community"}`,
});
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <!-- Loading State -->
    <div v-if="boardPending" class="flex items-center justify-center min-h-[400px]">
      <div class="text-center">
        <div
          class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
          role="status"
        >
          <span class="sr-only">Loading...</span>
        </div>
        <p class="mt-4 text-gray-600">Loading board members...</p>
      </div>
    </div>

    <!-- Organization Not Found -->
    <div
      v-else-if="!activeHoa"
      class="flex items-center justify-center min-h-[400px]"
    >
      <div class="text-center">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">
          Organization Not Found
        </h1>
        <p class="text-xl text-gray-600 mb-8">
          The organization you're looking for doesn't exist.
        </p>
        <NuxtLink
          to="/"
          class="inline-block bg-primary text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-primary/90 transition"
        >
          Go Home
        </NuxtLink>
      </div>
    </div>

    <!-- Content -->
    <div v-else class="p-6">
      <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-12 pt-8">
          <!-- Organization Logo -->
          <div v-if="orgLogoUrl" class="mb-6">
            <NuxtLink to="/">
              <img
                :src="orgLogoUrl"
                :alt="activeHoa?.name || 'Organization'"
                class="h-16 mx-auto object-contain"
              />
            </NuxtLink>
          </div>

          <h1 class="text-4xl font-bold text-stone-900 mb-4">
            Board of Directors
          </h1>
          <p class="text-lg text-stone-600 max-w-2xl mx-auto">
            Meet the dedicated volunteers who serve on our board and help guide our community.
          </p>
        </div>

        <!-- Board Members Grid -->
        <PagesBoardMembersSection
          :board-members="boardMembers"
          :show-email="false"
        />

        <!-- Back to Home Link -->
        <div class="text-center mt-12 pb-8">
          <NuxtLink
            to="/"
            class="inline-flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors"
          >
            <Icon name="heroicons:arrow-left" class="w-4 h-4" />
            Back to {{ activeHoa?.name || 'Home' }}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
