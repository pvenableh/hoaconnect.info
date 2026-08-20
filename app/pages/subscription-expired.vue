<script setup lang="ts">
import { describeGrace } from "#core/shared/transition/grace";

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

// The export page stays reachable after a subscription ends — see
// core/app/middleware/subscription.ts and docs/data-continuity-policy.md. This
// screen is where a cancelled board actually lands, so it is where the promise
// has to be visible; a guarantee nobody can find is a guarantee nobody has.
const exportPath = computed(() => {
  const slug = currentOrg.value?.organization?.slug;
  return slug ? `/${slug}/admin/settings/data` : null;
});

// A community that changed management companies has a `canceled` status and a
// grace window, which are two different situations wearing the same word. While
// the window is open they should not be here at all (the entitlement check lets
// them through), so if they arrive it is by typing the URL — and telling them
// their subscription has expired would be flatly untrue. When the window has
// closed, this IS the right screen, but "your grace period ended" explains what
// happened in a way "expired" does not.
const grace = computed(() =>
  describeGrace((currentOrg.value?.organization as any)?.grace_ends_at)
);

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
  if (grace.value) {
    return grace.value.active
      ? {
          title: 'Your community is still running',
          description: `${grace.value.detail} Nothing here is switched off yet.`,
          icon: 'i-lucide-life-buoy',
          iconColor: 'text-blue-500',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
        }
      : {
          title: 'Your transition grace period has ended',
          description: grace.value.detail,
          icon: 'i-lucide-clock',
          iconColor: 'text-amber-500',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
        };
  }

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
        iconColor: 't-text-muted',
        bgColor: 't-bg-subtle',
        borderColor: 't-border',
      };
    case 'trial':
      return {
        title: 'Trial Ended',
        // An org whose trial has no end date renders "ended on null" here —
        // pointless and slightly alarming on a screen someone hits at a bad
        // moment.
        description: trialEndsAt.value
          ? `Your free trial ended on ${trialEndsAt.value}. Subscribe now to continue using all features.`
          : 'Your free trial has ended. Subscribe now to continue using all features.',
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
  <div class="min-h-screen t-bg-subtle flex items-center justify-center p-4">
    <div class="max-w-md w-full">
      <!-- Card -->
      <div class="bg-white rounded-2xl shadow-lg border t-border overflow-hidden">
        <!-- Header with icon -->
        <div :class="['p-8 text-center', statusMessage.bgColor, statusMessage.borderColor, 'border-b']">
          <div :class="['inline-flex items-center justify-center w-16 h-16 rounded-full bg-white shadow-sm mb-4']">
            <Icon :name="statusMessage.icon" :class="['w-8 h-8', statusMessage.iconColor]" />
          </div>
          <h1 class="text-2xl font-bold t-text">
            {{ statusMessage.title }}
          </h1>
          <p class="t-text-secondary mt-2">
            {{ organizationName }}
          </p>
        </div>

        <!-- Content -->
        <div class="p-8">
          <p class="t-text-secondary text-center mb-6">
            {{ statusMessage.description }}
          </p>

          <!-- Features reminder -->
          <div class="t-bg-subtle rounded-lg p-4 mb-6">
            <p class="text-sm font-medium t-text-secondary mb-3">With an active subscription, you get:</p>
            <ul class="space-y-2">
              <li class="flex items-center gap-2 text-sm t-text-secondary">
                <Icon name="i-lucide-check" class="w-4 h-4 text-green-500 flex-shrink-0" />
                Full access to document management
              </li>
              <li class="flex items-center gap-2 text-sm t-text-secondary">
                <Icon name="i-lucide-check" class="w-4 h-4 text-green-500 flex-shrink-0" />
                Member and unit management
              </li>
              <li class="flex items-center gap-2 text-sm t-text-secondary">
                <Icon name="i-lucide-check" class="w-4 h-4 text-green-500 flex-shrink-0" />
                Payment collection tools
              </li>
              <li class="flex items-center gap-2 text-sm t-text-secondary">
                <Icon name="i-lucide-check" class="w-4 h-4 text-green-500 flex-shrink-0" />
                Custom domain support
              </li>
            </ul>
          </div>

          <!-- CTA Buttons -->
          <div class="space-y-3">
            <!-- While the window is open the community is not locked out, so the
                 way back in comes first. -->
            <NuxtLink
              v-if="grace?.active && exportPath"
              :to="exportPath.replace('/settings/data', '')"
              class="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-center font-medium rounded-lg transition"
            >
              Back to {{ organizationName }}
            </NuxtLink>

            <NuxtLink
              to="/settings/subscription"
              :class="[
                'block w-full py-3 px-4 text-center font-medium rounded-lg transition',
                grace?.active
                  ? 't-bg-subtle hover:bg-stone-200 t-text-secondary'
                  : 'bg-blue-600 hover:bg-blue-700 text-white',
              ]"
            >
              {{ grace?.active ? 'Set up your own billing' : subscriptionStatus === 'canceled' ? 'Reactivate Subscription' : 'Renew Subscription' }}
            </NuxtLink>

            <NuxtLink
              to="/auth/logout"
              class="block w-full py-3 px-4 t-bg-subtle hover:bg-stone-200 t-text-secondary text-center font-medium rounded-lg transition"
            >
              Sign Out
            </NuxtLink>
          </div>

          <!-- Your records don't expire with the subscription. -->
          <div v-if="exportPath" class="mt-6 pt-6 border-t t-border text-center">
            <p class="text-sm t-text-secondary">
              Your community's records are still yours, and still here.
            </p>
            <NuxtLink
              :to="exportPath"
              class="inline-flex items-center gap-2 mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              <Icon name="i-lucide-download" class="w-4 h-4" />
              Export your data
            </NuxtLink>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-8 py-4 t-bg-subtle border-t t-border">
          <p class="text-xs t-text-muted text-center">
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
