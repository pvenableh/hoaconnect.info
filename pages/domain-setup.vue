<template>
  <div>
    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="flex items-center justify-center min-h-[400px]"
    >
      <div class="text-center">
        <div
          class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
          role="status"
        >
          <span class="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
            Loading...
          </span>
        </div>
        <p class="mt-4 text-gray-600">Loading organization...</p>
      </div>
    </div>

    <!-- Main Content -->
    <AdminCustomDomainSetup v-else :hoaId="effectiveOrgId" />
  </div>
</template>
<script setup lang="ts">
const { selectedOrgId, isLoading } = useSelectedOrg();
const { user } = useDirectusAuth();

// Use selectedOrgId from memberships, but fallback to user.organization if available
const effectiveOrgId = computed(() => {
  if (selectedOrgId.value) {
    return selectedOrgId.value;
  }
  // Fallback to user's organization from auth
  if (user.value?.organizationId) {
    return user.value.organizationId;
  }
  return null;
});

definePageMeta({
  middleware: "auth",
  layout: "auth",
});
</script>
