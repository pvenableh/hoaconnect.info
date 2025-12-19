<script setup lang="ts">
const router = useRouter();

const { currentOrg, memberships, setOrganization, hasMultipleOrgs } =
  useSelectedOrg();

const showDropdown = ref(false);

const handleSelect = async (orgId: string) => {
  // Find the selected organization to get its slug
  const selectedMembership = (memberships.value as any[])?.find(
    (m: any) => m?.organization?.id === orgId
  );
  const newSlug = selectedMembership?.organization?.slug;

  await setOrganization(orgId);
  showDropdown.value = false;

  // Navigate to the new organization's page
  if (newSlug) {
    await router.push(`/${newSlug}`);
  } else {
    // Fallback: reload if no slug available
    window.location.reload();
  }
};

// Get status badge color
const getStatusColor = (status: string | null | undefined) => {
  switch (status) {
    case "active":
      return "bg-green-500";
    case "trial":
      return "bg-blue-500";
    case "expired":
      return "bg-red-500";
    case "canceled":
      return "bg-gray-400";
    default:
      return "bg-gray-400";
  }
};

// Get days remaining in trial
const getTrialDaysRemaining = (trialEndsAt: string | null | undefined) => {
  if (!trialEndsAt) return null;
  const endDate = new Date(trialEndsAt);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};
</script>

<template>
  <!-- Show organization name for single org (no dropdown) -->
  <div v-if="!hasMultipleOrgs && currentOrg" class="flex items-center gap-2 px-3 py-2 text-sm">
    <div class="relative">
      <Icon name="i-lucide-building-2" class="w-4 h-4" />
      <!-- Status indicator dot -->
      <span
        :class="[
          'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white',
          getStatusColor(currentOrg?.organization?.subscription_status),
        ]"
      />
    </div>
    <span class="font-medium">{{ currentOrg?.organization?.name }}</span>
    <!-- Show trial days remaining -->
    <span
      v-if="
        currentOrg?.organization?.subscription_status === 'trial' &&
        getTrialDaysRemaining(currentOrg?.organization?.trial_ends_at) !== null
      "
      class="text-xs text-blue-600 font-medium"
    >
      ({{ getTrialDaysRemaining(currentOrg?.organization?.trial_ends_at) }}d left)
    </span>
    <!-- Show expired warning -->
    <span
      v-else-if="currentOrg?.organization?.subscription_status === 'expired'"
      class="text-xs text-red-600 font-medium"
    >
      (Expired)
    </span>
  </div>

  <!-- Show dropdown for multiple orgs -->
  <div v-else-if="hasMultipleOrgs" class="relative">
    <button
      @click="showDropdown = !showDropdown"
      class="flex items-center gap-2 px-3 py-2 text-sm border rounded hover:bg-stone-50 transition-colors"
    >
      <div class="relative">
        <Icon name="i-lucide-building-2" class="w-4 h-4" />
        <!-- Status indicator dot -->
        <span
          :class="[
            'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white',
            getStatusColor(currentOrg?.organization?.subscription_status),
          ]"
        />
      </div>
      <span class="font-medium">{{
        currentOrg?.organization?.name || "Select HOA"
      }}</span>
      <span class="text-xs">▼</span>
    </button>

    <!-- Dropdown -->
    <div
      v-if="showDropdown"
      class="absolute top-full right-0 mt-2 w-72 bg-white border rounded-lg shadow-lg z-50"
    >
      <div class="p-2">
        <div class="flex items-center justify-between px-2 py-1 mb-1">
          <p class="text-xs text-stone-500">Switch Organization</p>
          <NuxtLink
            to="/organizations"
            class="text-xs text-blue-600 hover:text-blue-700"
            @click="showDropdown = false"
          >
            Manage All
          </NuxtLink>
        </div>
        <button
          v-for="membership in memberships"
          :key="membership.id"
          @click="handleSelect(membership.organization.id)"
          class="w-full text-left px-3 py-2 rounded hover:bg-stone-100 transition-colors"
          :class="{
            'bg-stone-100':
              membership.organization.id === currentOrg?.organization?.id,
          }"
        >
          <div class="flex items-center justify-between">
            <p class="font-medium">{{ membership.organization.name }}</p>
            <!-- Status badge -->
            <span
              :class="[
                'w-2 h-2 rounded-full',
                getStatusColor(membership.organization?.subscription_status),
              ]"
              :title="membership.organization?.subscription_status || 'Unknown'"
            />
          </div>
          <div class="flex items-center justify-between mt-0.5">
            <p class="text-xs text-stone-500">
              {{ membership.role?.name || "Guest" }}
            </p>
            <!-- Trial/expired info -->
            <span
              v-if="membership.organization?.subscription_status === 'trial'"
              class="text-xs text-blue-600"
            >
              {{ getTrialDaysRemaining(membership.organization?.trial_ends_at) }}d trial
            </span>
            <span
              v-else-if="membership.organization?.subscription_status === 'expired'"
              class="text-xs text-red-600"
            >
              Expired
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Click outside to close -->
    <div
      v-if="showDropdown"
      @click="showDropdown = false"
      class="fixed inset-0 z-40"
    />
  </div>
</template>
