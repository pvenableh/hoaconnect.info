<script setup lang="ts">
// Settings → Subscription. Pricing is FLAT PER BUILDING: the org's unit count
// selects a band and the band's fee is the price (it never multiplies). The page
// reads its quote from /api/org/billing/band and subscribes through
// /api/stripe/subscribe-band — both run the same `planBandCheckout`, so the
// number shown is the number charged. (Phase 9: this page used to list every
// plan and subscribe through the per-plan route, which never saved the org's
// Stripe customer — so a paid subscription never activated the org.)
import { toast } from "vue-sonner";
import { describeGrace } from "#core/shared/transition/grace";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

definePageMeta({
  middleware: ["auth"],
  layout: "auth",
});

const { user } = useDirectusAuth();
const { currentOrg, selectedOrgId } = await useSelectedOrg();

interface Quote {
  available: boolean;
  periodAmount?: number;
  onboardingAmount?: number;
  firstInvoiceCents?: number;
  reason?: "no_band" | "contact_only" | "no_price";
  message?: string;
}
interface BandQuote {
  units: number;
  band: { slug: string | null; name: string | null; minUnits: number | null; maxUnits: number | null; contactOnly: boolean } | null;
  monthly: Quote;
  annual: Quote;
  ladder: Array<{
    slug: string | null;
    name: string | null;
    minUnits: number | null;
    maxUnits: number | null;
    priceMonthly: number | null;
    priceYearly: number | null;
    contactOnly: boolean;
    current: boolean;
  }>;
}

const { data: quote, pending: quotePending, error: quoteError } = await useAsyncData(
  "org-billing-band",
  () =>
    selectedOrgId.value
      ? $fetch<BandQuote>("/api/org/billing/band", { query: { organizationId: selectedOrgId.value } })
      : Promise.resolve(null),
  { watch: [selectedOrgId] }
);

const interval = ref<"monthly" | "annual">("monthly");
const intervalItems = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
];
const activeQuote = computed<Quote | null>(() => (quote.value ? quote.value[interval.value] : null));

/** Annual saving vs twelve months, from the band's own prices (not a slogan). */
const annualSaving = computed(() => {
  const m = quote.value?.monthly.periodAmount;
  const y = quote.value?.annual.periodAmount;
  if (!m || !y) return null;
  const pct = Math.round((1 - y / (m * 12)) * 100);
  return pct > 0 ? pct : null;
});

const isProcessing = ref(false);
const checkout = ref<{ clientSecret: string; email: string; amountCents: number; planName: string } | null>(null);
const checkoutOpen = computed({
  get: () => !!checkout.value,
  set: (v: boolean) => {
    if (!v) checkout.value = null;
  },
});
const returnUrl = computed(() => (import.meta.client ? `${window.location.origin}/settings/subscription` : undefined));

// The grace window a management transition opens. This page is where the grace
// banner's "Set up billing" sends a board, so it must not greet them with a red
// "Subscription Not Active" — they arrived BECAUSE they were told everything
// still works. Status stays honest; the grace notice explains it.
const grace = computed(() => describeGrace((currentOrg.value?.organization as any)?.grace_ends_at));

const currentSubscription = computed(() => ({
  status: currentOrg.value?.organization?.subscription_status,
  trialEndsAt: currentOrg.value?.organization?.trial_ends_at,
  isFreeAccount: currentOrg.value?.organization?.is_free_account === true,
}));

const trialDaysRemaining = computed(() => {
  if (!currentSubscription.value.trialEndsAt) return null;
  const diff = new Date(currentSubscription.value.trialEndsAt).getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  return days > 0 ? days : 0;
});

const formatDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A";

const formatPrice = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(Number(n) || 0);

const bandRange = (min: number | null, max: number | null) =>
  max == null ? `${min ?? 0}+ units` : `${min ?? 0}–${max} units`;

const STATUS: Record<string, { label: string; tone: string }> = {
  free: { label: "Free account", tone: "bg-primary/15 text-primary" },
  active: { label: "Active", tone: "bg-success/15 text-success" },
  trial: { label: "Trial", tone: "bg-info/15 text-info" },
  expired: { label: "Expired", tone: "bg-destructive/15 text-destructive" },
  canceled: { label: "Canceled", tone: "t-bg-subtle t-text" },
};
const statusChip = computed(
  () =>
    STATUS[currentSubscription.value.isFreeAccount ? "free" : String(currentSubscription.value.status)] ?? {
      label: "Unknown",
      tone: "t-bg-subtle t-text-muted",
    }
);

const canSubscribe = computed(
  () => !currentSubscription.value.isFreeAccount && currentSubscription.value.status !== "active"
);

const handleSubscribe = async () => {
  if (isProcessing.value || !selectedOrgId.value) return;
  isProcessing.value = true;
  try {
    const res = await $fetch<{ clientSecret: string | null; firstInvoiceCents: number; band: { name: string | null } }>(
      "/api/stripe/subscribe-band",
      { method: "POST", body: { organizationId: selectedOrgId.value, interval: interval.value, onboarding: "standard" } }
    );
    if (!res?.clientSecret) {
      toast.error("Stripe didn't return a payment form — try again, or contact support.");
      return;
    }
    checkout.value = {
      clientSecret: res.clientSecret,
      email: user.value?.email || "",
      amountCents: res.firstInvoiceCents,
      planName: `${res.band.name || "Your band"} · ${interval.value === "annual" ? "annual" : "monthly"}`,
    };
  } catch (error: any) {
    toast.error(error?.data?.message || error?.message || "Couldn't start the subscription");
  } finally {
    isProcessing.value = false;
  }
};

const onCheckoutError = (err: Error) => toast.error(err?.message || "Payment failed");

// The Stripe-hosted billing portal (payment method, invoices, cancel).
const handleManageBilling = async () => {
  try {
    const { url } = await $fetch<{ url: string }>("/api/stripe/portal", {
      method: "POST",
      body: { organizationId: selectedOrgId.value },
    });
    if (url && import.meta.client) window.location.href = url;
  } catch (error: any) {
    toast.error(error?.data?.message || "Couldn't open the billing portal");
  }
};
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-8">
    <AppPageHeader title="Subscription" description="One flat price per building, set by its number of units." />

    <!-- One surface: status, your band, the band ladder, help — grouped by dividers. -->
    <section class="ios-card divide-y divide-[var(--theme-border-light)]" data-testid="subscription-surface">
      <!-- Status -->
      <div class="p-6 space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <span
            class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
            :class="statusChip.tone"
            data-testid="subscription-status"
          >
            {{ statusChip.label }}
          </span>
          <PaymentStripeModeBadge />
          <span v-if="currentSubscription.status === 'trial'" class="text-sm t-text-secondary">
            Trial ends {{ formatDate(currentSubscription.trialEndsAt) }}
            <template v-if="trialDaysRemaining !== null">({{ trialDaysRemaining }} days left)</template>
          </span>
        </div>

        <div v-if="currentSubscription.isFreeAccount" class="flex items-start gap-3">
          <Icon name="i-lucide-gift" class="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <p class="text-sm t-text-secondary">
            Your community has a free account with full access. No subscription payment is required.
          </p>
        </div>
        <div v-else-if="grace?.active" class="flex items-start gap-3">
          <Icon name="i-lucide-life-buoy" class="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
          <div>
            <p class="font-medium t-text">{{ grace.headline }}</p>
            <p class="text-sm t-text-secondary mt-1">{{ grace.detail }}</p>
          </div>
        </div>
        <div
          v-else-if="currentSubscription.status === 'expired' || currentSubscription.status === 'canceled'"
          class="flex items-start gap-3"
        >
          <Icon name="i-lucide-alert-circle" class="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p class="text-sm t-text-secondary">
            Your subscription is {{ currentSubscription.status }}. Subscribe below to restore full access.
          </p>
        </div>

        <Button v-if="currentSubscription.status === 'active'" variant="outline" size="sm" @click="handleManageBilling">
          Manage billing and payment methods
        </Button>
      </div>

      <!-- Your band -->
      <div v-if="!currentSubscription.isFreeAccount" class="p-6 space-y-4" data-testid="subscription-quote">
        <div v-if="quotePending" class="flex justify-center py-8"><span class="spinner-ios spinner-ios--lg" /></div>

        <p v-else-if="quoteError || !quote" class="text-sm t-text-secondary">
          We couldn't load your community's pricing. Refresh, or contact support below.
        </p>

        <template v-else>
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="type-micro t-text-muted">Your band</p>
              <p class="text-xl font-semibold t-text" data-testid="subscription-band">
                {{ quote.band?.name || "No band" }}
              </p>
              <p class="text-sm t-text-secondary">
                {{ quote.units }} {{ quote.units === 1 ? "unit" : "units" }} on file
                <template v-if="quote.band"> · {{ bandRange(quote.band.minUnits, quote.band.maxUnits) }}</template>
              </p>
            </div>
            <AppSegmentedControl
              v-if="canSubscribe && !quote.band?.contactOnly"
              v-model="interval"
              :items="intervalItems"
              size="sm"
              label="Billing interval"
            />
          </div>

          <template v-if="activeQuote?.available">
            <div>
              <span class="text-3xl font-bold t-text" data-testid="subscription-price">
                {{ formatPrice(activeQuote.periodAmount) }}
              </span>
              <span class="t-text-muted">/{{ interval === "annual" ? "year" : "month" }}</span>
              <span v-if="interval === 'annual' && annualSaving" class="ml-2 text-sm text-success">
                saves {{ annualSaving }}% over monthly
              </span>
            </div>
            <p v-if="activeQuote.onboardingAmount" class="text-sm t-text-secondary">
              Plus a one-time {{ formatPrice(activeQuote.onboardingAmount) }} onboarding fee on the first invoice —
              {{ formatPrice((activeQuote.firstInvoiceCents ?? 0) / 100) }} today.
            </p>
            <Button v-if="canSubscribe" :disabled="isProcessing" data-testid="subscription-subscribe" @click="handleSubscribe">
              {{ currentSubscription.status === "trial" ? "Subscribe now" : "Subscribe" }}
            </Button>
          </template>

          <div v-else-if="activeQuote?.reason === 'contact_only'" class="space-y-3">
            <p class="text-sm t-text-secondary">
              Communities this size are priced with us directly — onboarding, migration and support are tailored.
            </p>
            <Button as="a" href="mailto:support@hoaconnect.com?subject=Subscription%20pricing" variant="outline">
              Talk to us
            </Button>
          </div>

          <p v-else class="text-sm t-text-secondary">
            {{ activeQuote?.message || "Self-serve checkout isn't available for this band yet." }}
            Contact support below and we'll set it up.
          </p>
        </template>
      </div>

      <!-- The band ladder -->
      <div v-if="quote?.ladder?.length && !currentSubscription.isFreeAccount" class="p-6">
        <p class="type-micro t-text-muted mb-3">All bands</p>
        <ul class="divide-y divide-[var(--theme-border-light)]" data-testid="subscription-ladder">
          <li
            v-for="b in quote.ladder"
            :key="b.slug || b.name || ''"
            class="flex items-center justify-between gap-4 py-2.5 text-sm"
            :class="b.current ? 't-text font-medium' : 't-text-secondary'"
          >
            <span>
              {{ b.name }}
              <span class="t-text-muted font-normal"> · {{ bandRange(b.minUnits, b.maxUnits) }}</span>
              <span v-if="b.current" class="ml-2 text-xs text-primary">yours</span>
            </span>
            <span class="tabular-nums">{{ b.contactOnly ? "Contact us" : `${formatPrice(b.priceMonthly)}/mo` }}</span>
          </li>
        </ul>
      </div>

      <!-- Help -->
      <div class="p-6">
        <p class="font-medium t-text mb-1">Need help?</p>
        <p class="text-sm t-text-secondary mb-3">Questions about billing, or a change to your subscription?</p>
        <Button as="a" href="mailto:support@hoaconnect.com" variant="link" class="px-0">Contact support</Button>
      </div>
    </section>

    <!-- Stripe checkout: the dialog is the card. -->
    <Dialog v-model:open="checkoutOpen">
      <DialogContent class="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete your subscription</DialogTitle>
          <DialogDescription>{{ checkout?.planName }}</DialogDescription>
        </DialogHeader>
        <PaymentStripeCard
          v-if="checkout"
          :client-secret="checkout.clientSecret"
          :email="checkout.email"
          :amount="checkout.amountCents"
          payment-type="card"
          :return-url="returnUrl"
          @error="onCheckoutError"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>
