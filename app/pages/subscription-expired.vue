<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
  layout: 'default',
});

const { user } = useDirectusAuth();

// Get org info for display
const { currentOrg } = user.value
  ? await useSelectedOrg()
  : { currentOrg: ref(null) };

const subscriptionStatus = computed(() => {
  return currentOrg.value?.organization?.subscription_status || 'expired';
});

const organizationName = computed(() => {
  return currentOrg.value?.organization?.name || 'Your organization';
});

const trialEndsAt = computed(() => {
  const date = currentOrg.value?.organization?.trial_ends_at;
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
});

const statusMessage = computed(() => {
  switch (subscriptionStatus.value) {
    case 'expired':
      return {
        title: 'Subscription Expired',
        description: 'Your subscription has expired. Please renew to continue accessing all features.',
        icon: 'i-lucide-alert-circle',
        iconColor: 'text-red-500',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
      };
    case 'canceled':
      return {
        title: 'Subscription Canceled',
        description: 'Your subscription has been canceled. Reactivate to restore access to all features.',
        icon: 'i-lucide-x-circle',
        iconColor: 'text-gray-500',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
      };
    case 'trial':
      return {
        title: 'Trial Ended',
        description: `Your free trial ended on ${trialEndsAt.value}. Subscribe now to continue using all features.`,
        icon: 'i-lucide-clock',
        iconColor: 'text-amber-500',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
      };
    default:
      return {
        title: 'Subscription Required',
        description: 'An active subscription is required to access this content.',
        icon: 'i-lucide-lock',
        iconColor: 'text-blue-500',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
      };
  }
});
</script>

<template>
  <div class="min-h-screen bg-stone-50 flex items-center justify-center p-4">
    <div class="max-w-md w-full">
      <!-- Card -->
      <div class="bg-white rounded-2xl shadow-lg border border-stone-200 overflow-hidden">
        <!-- Header with icon -->
        <div :class="['p-8 text-center', statusMessage.bgColor, statusMessage.borderColor, 'border-b']">
          <div :class="['inline-flex items-center justify-center w-16 h-16 rounded-full bg-white shadow-sm mb-4']">
            <Icon :name="statusMessage.icon" :class="['w-8 h-8', statusMessage.iconColor]" />
          </div>
          <h1 class="text-2xl font-bold text-stone-900">
            {{ statusMessage.title }}
          </h1>
          <p class="text-stone-600 mt-2">
            {{ organizationName }}
          </p>
        </div>

        <!-- Content -->
        <div class="p-8">
          <p class="text-stone-600 text-center mb-6">
            {{ statusMessage.description }}
          </p>

          <!-- Features reminder -->
          <div class="bg-stone-50 rounded-lg p-4 mb-6">
            <p class="text-sm font-medium text-stone-700 mb-3">With an active subscription, you get:</p>
            <ul class="space-y-2">
              <li class="flex items-center gap-2 text-sm text-stone-600">
                <Icon name="i-lucide-check" class="w-4 h-4 text-green-500 flex-shrink-0" />
                Full access to document management
              </li>
              <li class="flex items-center gap-2 text-sm text-stone-600">
                <Icon name="i-lucide-check" class="w-4 h-4 text-green-500 flex-shrink-0" />
                Member and unit management
              </li>
              <li class="flex items-center gap-2 text-sm text-stone-600">
                <Icon name="i-lucide-check" class="w-4 h-4 text-green-500 flex-shrink-0" />
                Payment collection tools
              </li>
              <li class="flex items-center gap-2 text-sm text-stone-600">
                <Icon name="i-lucide-check" class="w-4 h-4 text-green-500 flex-shrink-0" />
                Custom domain support
              </li>
            </ul>
          </div>

          <!-- CTA Buttons -->
          <div class="space-y-3">
            <NuxtLink
              to="/settings/subscription"
              class="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-center font-medium rounded-lg transition"
            >
              {{ subscriptionStatus === 'canceled' ? 'Reactivate Subscription' : 'Renew Subscription' }}
            </NuxtLink>

            <NuxtLink
              to="/auth/logout"
              class="block w-full py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 text-center font-medium rounded-lg transition"
            >
              Sign Out
            </NuxtLink>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-8 py-4 bg-stone-50 border-t border-stone-200">
          <p class="text-xs text-stone-500 text-center">
            Need help? Contact us at
            <a href="mailto:support@hoaconnect.com" class="text-blue-600 hover:text-blue-700">
              support@hoaconnect.com
            </a>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
