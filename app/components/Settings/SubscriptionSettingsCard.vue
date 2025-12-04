<template>
  <div class="space-y-6">
    <!-- Current Plan -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>
              Your active subscription details
            </CardDescription>
          </div>
          <Badge :variant="statusVariant">
            {{ statusLabel }}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div class="space-y-6">
          <!-- Plan Info -->
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-2xl font-bold">{{ planName }}</h3>
              <p class="text-muted-foreground mt-1">
                {{ planDescription }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-3xl font-bold">
                {{ formattedPrice }}
              </p>
              <p class="text-sm text-muted-foreground">
                per {{ billingCycle }}
              </p>
            </div>
          </div>

          <!-- Plan Features -->
          <div v-if="planFeatures.length > 0" class="pt-4 border-t">
            <h4 class="font-medium mb-3">Plan Features</h4>
            <ul class="space-y-2">
              <li
                v-for="(feature, index) in planFeatures"
                :key="index"
                class="flex items-center gap-2"
              >
                <Icon name="lucide:check" class="h-4 w-4 text-green-600" />
                <span class="text-sm">{{ feature }}</span>
              </li>
            </ul>
          </div>

          <!-- Usage Stats -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            <div class="p-4 rounded-lg bg-muted/50">
              <p class="text-sm text-muted-foreground">Members</p>
              <p class="text-2xl font-bold mt-1">
                {{ organization.member_count || 0 }}
                <span v-if="maxMembers" class="text-sm font-normal text-muted-foreground">
                  / {{ maxMembers }}
                </span>
              </p>
            </div>
            <div class="p-4 rounded-lg bg-muted/50">
              <p class="text-sm text-muted-foreground">Documents</p>
              <p class="text-2xl font-bold mt-1">
                -
                <span v-if="maxDocuments" class="text-sm font-normal text-muted-foreground">
                  / {{ maxDocuments }}
                </span>
              </p>
            </div>
            <div class="p-4 rounded-lg bg-muted/50">
              <p class="text-sm text-muted-foreground">Storage</p>
              <p class="text-2xl font-bold mt-1">
                -
                <span v-if="maxStorageGb" class="text-sm font-normal text-muted-foreground">
                  / {{ maxStorageGb }}GB
                </span>
              </p>
            </div>
          </div>

          <!-- Trial Info -->
          <Alert v-if="isTrialing" class="bg-blue-50 border-blue-200">
            <Icon name="lucide:clock" class="h-4 w-4 text-blue-600" />
            <div class="ml-2">
              <p class="font-medium text-blue-900">Trial Period</p>
              <p class="text-sm text-blue-700">
                Your trial ends {{ trialEndsFormatted }}.
                Add a payment method to continue after your trial.
              </p>
            </div>
          </Alert>
        </div>
      </CardContent>
      <CardFooter class="flex justify-between border-t pt-6">
        <Button variant="outline" disabled>
          <Icon name="lucide:arrow-up-circle" class="h-4 w-4 mr-2" />
          Upgrade Plan
        </Button>
        <Button variant="ghost" disabled>
          Manage Billing
        </Button>
      </CardFooter>
    </Card>

    <!-- Billing History -->
    <Card>
      <CardHeader>
        <CardTitle>Billing History</CardTitle>
        <CardDescription>
          View your past invoices and payments
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="text-center py-8 text-muted-foreground">
          <Icon name="lucide:receipt" class="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No billing history available</p>
          <p class="text-sm mt-1">
            Your invoices will appear here once you have an active subscription.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- Payment Method -->
    <Card>
      <CardHeader>
        <CardTitle>Payment Method</CardTitle>
        <CardDescription>
          Manage your payment information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="hasPaymentMethod" class="flex items-center justify-between p-4 border rounded-lg">
          <div class="flex items-center gap-3">
            <Icon name="lucide:credit-card" class="h-8 w-8" />
            <div>
              <p class="font-medium">**** **** **** {{ last4 }}</p>
              <p class="text-sm text-muted-foreground">Expires {{ expiryDate }}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" disabled>
            Update
          </Button>
        </div>
        <div v-else class="text-center py-8">
          <Icon name="lucide:credit-card" class="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p class="text-muted-foreground">No payment method on file</p>
          <Button class="mt-4" disabled>
            <Icon name="lucide:plus" class="h-4 w-4 mr-2" />
            Add Payment Method
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Danger Zone -->
    <Card class="border-destructive/50">
      <CardHeader>
        <CardTitle class="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible actions for your subscription
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex items-center justify-between p-4 border border-destructive/30 rounded-lg">
          <div>
            <p class="font-medium">Cancel Subscription</p>
            <p class="text-sm text-muted-foreground">
              Cancel your subscription. You'll lose access at the end of your billing period.
            </p>
          </div>
          <Button variant="destructive" size="sm" disabled>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type { HoaOrganization, SubscriptionPlan } from "~~/types/directus";

const props = defineProps<{
  organization: HoaOrganization;
}>();

// Extract subscription plan details
const subscriptionPlan = computed(() => {
  if (typeof props.organization.subscription_plan === "object") {
    return props.organization.subscription_plan as SubscriptionPlan;
  }
  return null;
});

// Plan info
const planName = computed(() => {
  return subscriptionPlan.value?.name || "Free Plan";
});

const planDescription = computed(() => {
  return subscriptionPlan.value?.description || "Basic HOA management features";
});

const billingCycle = computed(() => {
  return props.organization.billing_cycle || "month";
});

const formattedPrice = computed(() => {
  const plan = subscriptionPlan.value;
  if (!plan) return "$0";

  const rawPrice = billingCycle.value === "yearly"
    ? plan.price_yearly
    : plan.price_monthly;

  if (!rawPrice || rawPrice === 0) return "Free";
  const price = typeof rawPrice === "string" ? parseFloat(rawPrice) : rawPrice;
  if (isNaN(price)) return "Free";
  return `$${price.toFixed(2)}`;
});

// Plan features (parsed from JSON)
const planFeatures = computed(() => {
  const features = subscriptionPlan.value?.features;
  if (!features) return [];
  if (typeof features === "string") {
    try {
      return JSON.parse(features);
    } catch {
      return [];
    }
  }
  return Array.isArray(features) ? features : [];
});

// Plan limits
const maxMembers = computed(() => subscriptionPlan.value?.max_members);
const maxDocuments = computed(() => subscriptionPlan.value?.max_documents);
const maxStorageGb = computed(() => subscriptionPlan.value?.max_storage_gb);

// Status
const statusLabel = computed(() => {
  switch (props.organization.subscription_status) {
    case "active":
      return "Active";
    case "trial":
      return "Trial";
    case "canceled":
      return "Canceled";
    case "expired":
      return "Expired";
    default:
      return "Unknown";
  }
});

const statusVariant = computed(() => {
  switch (props.organization.subscription_status) {
    case "active":
      return "default";
    case "trial":
      return "secondary";
    case "canceled":
    case "expired":
      return "destructive";
    default:
      return "outline";
  }
});

const isTrialing = computed(() => {
  return props.organization.subscription_status === "trial";
});

const trialEndsFormatted = computed(() => {
  if (!props.organization.trial_ends_at) return "soon";
  const date = new Date(props.organization.trial_ends_at);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
});

// Payment method (placeholder - would come from Stripe)
const hasPaymentMethod = computed(() => false);
const last4 = computed(() => "");
const expiryDate = computed(() => "");
</script>
