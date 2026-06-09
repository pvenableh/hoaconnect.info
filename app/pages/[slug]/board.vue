<script setup lang="ts">
const route = useRoute();
const config = useRuntimeConfig();

// Get slug from route params
const slug = computed(() => route.params.slug as string);

// Fetch organization info for header/branding
const { data: organization, pending: orgPending } = await useAsyncData(
  `organization-${slug.value}`,
  async () => {
    const response = await $fetch(`/api/hoa/find?slug=${slug.value}`);
    return response;
  }
);

// Fetch board members
const { data: boardData, pending: boardPending } = await useAsyncData(
  `board-members-${slug.value}`,
  async () => {
    const response = await $fetch(`/api/hoa/board-members?slug=${slug.value}`);
    return response;
  }
);

const pending = computed(() => orgPending.value || boardPending.value);
const boardMembers = computed(() => boardData.value?.boardMembers || []);

// Helper function to get Directus file URL
const getFileUrl = (file: any) => {
  if (!file) return "";
  const fileId = typeof file === "object" ? file.id : file;
  return `${config.public.directus.url}/assets/${fileId}`;
};

// Get org logo URL
const orgLogoUrl = computed(() => {
  const logoId = organization.value?.settings?.logo;
  if (!logoId) return null;
  const fileId = typeof logoId === "string" ? logoId : logoId?.id;
  if (!fileId) return null;
  return `${config.public.directus.url}/assets/${fileId}?key=medium-contain`;
});

// Set dynamic meta tags
useSeoMeta({
  title: () =>
    organization.value
      ? `Board of Directors - ${organization.value.name}`
      : "Board of Directors",
  description: () =>
    `Meet the board of directors for ${organization.value?.name || "our community"}`,
  ogTitle: () =>
    organization.value
      ? `Board of Directors - ${organization.value.name}`
      : "Board of Directors",
  ogDescription: () =>
    `Meet the board of directors for ${organization.value?.name || "our community"}`,
});
</script>

<template>
  <div class="ui-kit accent-violet min-h-screen t-bg">
    <!-- Loading State -->
    <div v-if="pending" class="flex items-center justify-center min-h-[400px]">
      <div class="text-center">
        <span class="spinner-ios spinner-ios--lg" role="status">
          <span class="sr-only">Loading...</span>
        </span>
        <p class="mt-4 t-text-secondary">Loading board members...</p>
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
        <NuxtLink
          to="/"
          class="inline-block t-bg-accent t-text-inverse px-8 py-3 rounded-lg text-lg font-semibold hover:opacity-90 transition"
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
            <NuxtLink :to="`/${slug}`">
              <img
                :src="orgLogoUrl"
                :alt="organization?.name || 'Organization'"
                class="h-16 mx-auto object-contain"
              />
            </NuxtLink>
          </div>

          <h1 class="text-4xl font-bold t-text t-heading mb-4">
            Board of Directors
          </h1>
          <p class="text-lg t-text-secondary max-w-2xl mx-auto">
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
          <BackLink :to="`/${slug}`" :label="`Back to ${organization?.name || 'Home'}`" />
        </div>
      </div>
    </div>
  </div>
</template>
