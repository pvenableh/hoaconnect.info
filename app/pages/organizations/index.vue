<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  middleware: ["auth", "subscription"],
});

const { user } = useDirectusAuth();
const { list: listMembers } = useDirectusItems("hoa_members");
const { setOrganization, selectedOrgId } = await useSelectedOrg();

// Fetch all organizations the user belongs to
const {
  data: memberships,
  pending,
  refresh,
} = await useAsyncData(
  "user-organizations",
  async () => {
    if (!user.value?.id) return [];

    try {
      const result = await listMembers({
        fields: [
          "id",
          "role.id",
          "role.name",
          "status",
          "organization.id",
          "organization.name",
          "organization.slug",
          "organization.status",
          "organization.subscription_status",
          "organization.subscription_plan.name",
          "organization.subscription_plan.price_monthly",
          "organization.trial_ends_at",
          "organization.settings.logo",
          "organization.member_count",
          "organization.date_created",
        ],
        filter: {
          user: { _eq: user.value.id },
        },
        sort: ["organization.name"],
      });

      return result || [];
    } catch (error) {
      console.error("Error fetching organizations:", error);
      return [];
    }
  },
  {
    watch: [user],
  }
);

// Computed helpers
const getStatusColor = (status: string | null | undefined) => {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-800";
    case "trial":
      return "bg-blue-100 text-blue-800";
    case "expired":
      return "bg-red-100 text-red-800";
    case "canceled":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-500";
  }
};

const getStatusLabel = (status: string | null | undefined) => {
  switch (status) {
    case "active":
      return "Active";
    case "trial":
      return "Trial";
    case "expired":
      return "Expired";
    case "canceled":
      return "Canceled";
    default:
      return "Unknown";
  }
};

const getTrialDaysRemaining = (trialEndsAt: string | null | undefined) => {
  if (!trialEndsAt) return null;
  const endDate = new Date(trialEndsAt);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const handleSelectOrg = async (orgId: string) => {
  await setOrganization(orgId);
  toast.success("Organization switched successfully");
  window.location.href = "/dashboard";
};

const handleManageSubscription = (orgId: string, slug: string) => {
  // Navigate to subscription management for this org
  navigateTo(`/settings/subscription?org=${orgId}`);
};
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <AppNav />

    <main class="max-w-6xl mx-auto px-6 py-8">
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-stone-900">My Organizations</h1>
          <p class="text-stone-600 mt-1">
            Manage all organizations you belong to
          </p>
        </div>
        <NuxtLink
          to="/organizations/new"
          class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          <Icon name="i-lucide-plus" class="w-4 h-4" />
          Create Organization
        </NuxtLink>
      </div>

      <!-- Loading State -->
      <div v-if="pending" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!memberships || memberships.length === 0"
        class="text-center py-16 bg-white rounded-xl border border-stone-200"
      >
        <Icon name="i-lucide-building-2" class="w-12 h-12 mx-auto text-stone-400 mb-4" />
        <h3 class="text-lg font-medium text-stone-900 mb-2">No Organizations</h3>
        <p class="text-stone-600 mb-6">
          You don't belong to any organizations yet.
        </p>
        <NuxtLink
          to="/organizations/new"
          class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Icon name="i-lucide-plus" class="w-4 h-4" />
          Create Your First Organization
        </NuxtLink>
      </div>

      <!-- Organizations List -->
      <div v-else class="space-y-4">
        <div
          v-for="membership in memberships"
          :key="membership.id"
          class="bg-white rounded-xl border border-stone-200 p-6 hover:border-stone-300 transition"
          :class="{
            'ring-2 ring-blue-500 border-blue-500':
              membership.organization?.id === selectedOrgId,
          }"
        >
          <div class="flex items-start justify-between">
            <!-- Left: Org Info -->
            <div class="flex items-start gap-4">
              <!-- Logo or Placeholder -->
              <div
                class="w-14 h-14 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0"
              >
                <img
                  v-if="membership.organization?.settings?.logo"
                  :src="`${$config.public.directus.url}/assets/${
                    typeof membership.organization.settings.logo === 'string'
                      ? membership.organization.settings.logo
                      : membership.organization.settings.logo?.id
                  }?key=small-contain`"
                  :alt="membership.organization?.name"
                  class="w-full h-full object-contain rounded-lg"
                />
                <Icon
                  v-else
                  name="i-lucide-building-2"
                  class="w-7 h-7 text-stone-400"
                />
              </div>

              <!-- Info -->
              <div>
                <div class="flex items-center gap-3 mb-1">
                  <h3 class="text-lg font-semibold text-stone-900">
                    {{ membership.organization?.name || "Unknown Organization" }}
                  </h3>
                  <span
                    v-if="membership.organization?.id === selectedOrgId"
                    class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                  >
                    Current
                  </span>
                </div>

                <div class="flex items-center gap-4 text-sm text-stone-600">
                  <span class="flex items-center gap-1">
                    <Icon name="i-lucide-shield" class="w-4 h-4" />
                    {{ membership.role?.name || "Member" }}
                  </span>
                  <span class="flex items-center gap-1">
                    <Icon name="i-lucide-link" class="w-4 h-4" />
                    /{{ membership.organization?.slug }}
                  </span>
                  <span
                    v-if="membership.organization?.member_count"
                    class="flex items-center gap-1"
                  >
                    <Icon name="i-lucide-users" class="w-4 h-4" />
                    {{ membership.organization.member_count }} members
                  </span>
                </div>

                <!-- Subscription Info -->
                <div class="flex items-center gap-3 mt-3">
                  <span
                    :class="[
                      'text-xs font-medium px-2.5 py-1 rounded-full',
                      getStatusColor(membership.organization?.subscription_status),
                    ]"
                  >
                    {{ getStatusLabel(membership.organization?.subscription_status) }}
                  </span>

                  <span
                    v-if="membership.organization?.subscription_plan?.name"
                    class="text-xs text-stone-600"
                  >
                    {{ membership.organization.subscription_plan.name }} Plan
                  </span>

                  <span
                    v-if="
                      membership.organization?.subscription_status === 'trial' &&
                      membership.organization?.trial_ends_at
                    "
                    class="text-xs text-blue-600 font-medium"
                  >
                    {{
                      getTrialDaysRemaining(membership.organization.trial_ends_at)
                    }}
                    days left
                  </span>

                  <span
                    v-if="membership.organization?.subscription_status === 'expired'"
                    class="text-xs text-red-600 font-medium"
                  >
                    Subscription expired
                  </span>
                </div>
              </div>
            </div>

            <!-- Right: Actions -->
            <div class="flex items-center gap-2">
              <button
                v-if="membership.organization?.id !== selectedOrgId"
                @click="handleSelectOrg(membership.organization?.id)"
                class="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition"
              >
                Switch to this
              </button>

              <button
                v-if="
                  membership.organization?.subscription_status === 'expired' ||
                  membership.organization?.subscription_status === 'canceled'
                "
                @click="
                  handleManageSubscription(
                    membership.organization?.id,
                    membership.organization?.slug
                  )
                "
                class="px-4 py-2 text-sm font-medium bg-green-600 text-white hover:bg-green-700 rounded-lg transition"
              >
                Renew Subscription
              </button>

              <NuxtLink
                v-if="
                  membership.role?.name === 'HOA Admin' ||
                  membership.role?.name === 'Administrator'
                "
                :to="`/settings/organization`"
                @click="handleSelectOrg(membership.organization?.id)"
                class="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition"
                title="Settings"
              >
                <Icon name="i-lucide-settings" class="w-5 h-5" />
              </NuxtLink>
            </div>
          </div>

          <!-- Warning for expired subscriptions -->
          <div
            v-if="membership.organization?.subscription_status === 'expired'"
            class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg"
          >
            <div class="flex items-start gap-2">
              <Icon
                name="i-lucide-alert-circle"
                class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
              />
              <div class="text-sm text-red-800">
                <p class="font-medium">Subscription Expired</p>
                <p class="mt-0.5">
                  Your subscription has expired. Renew now to restore full access
                  to all features.
                </p>
              </div>
            </div>
          </div>

          <!-- Trial ending warning -->
          <div
            v-else-if="
              membership.organization?.subscription_status === 'trial' &&
              getTrialDaysRemaining(membership.organization?.trial_ends_at) !== null &&
              getTrialDaysRemaining(membership.organization?.trial_ends_at)! <= 7
            "
            class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg"
          >
            <div class="flex items-start gap-2">
              <Icon
                name="i-lucide-clock"
                class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
              />
              <div class="text-sm text-amber-800">
                <p class="font-medium">Trial Ending Soon</p>
                <p class="mt-0.5">
                  Your trial ends on
                  {{ formatDate(membership.organization?.trial_ends_at) }}. Add a
                  payment method to continue using all features.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
