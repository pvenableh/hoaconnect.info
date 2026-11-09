<script setup lang="ts">
// Operator console: overview (docs/plan-operator-console.md §5, Phase 1).
import { money, relativeDays } from "#core/shared/ops/format";

definePageMeta({ middleware: ["auth"], layout: "auth" });
useHead({ title: "Operations" });

const { data, pending, error, refresh } = await useFetch<any>("/api/ops/overview");

const o = computed(() => data.value);
const c = computed(() => o.value?.communities ?? null);

const buckets = computed(() => {
  const s = c.value;
  if (!s) return [];
  return [
    { key: "active", label: "Active", value: s.active, filter: "active", tone: "text-success" },
    { key: "trial", label: "Trial", value: s.trial, filter: "trial", tone: "text-info" },
    { key: "trial_ending", label: "Trial ending ≤ 3 days", value: s.trial_ending, filter: "trial_ending", tone: "text-warning" },
    { key: "past_due", label: "Past due", value: s.past_due, filter: "past_due", tone: "text-warning" },
    { key: "expired", label: "Expired", value: s.expired, filter: "expired", tone: "text-destructive" },
    { key: "canceled", label: "Canceled", value: s.canceled, filter: "canceled", tone: "t-text-muted" },
    { key: "free", label: "Free", value: s.free, filter: "free", tone: "text-info" },
    { key: "agency", label: "Agency-billed", value: s.agency, filter: "agency", tone: "t-text" },
    { key: "no_units", label: "No units yet", value: o.value?.noUnits ?? 0, filter: "no_units", tone: "t-text-muted" },
  ];
});

const subStatuses = computed(() => Object.entries(o.value?.revenue?.byStatus ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number)));
</script>

<template>
  <OpsShell title="Overview" description="Who pays, what's failing or ending, and whether Stripe is keeping up." :stripe-mode="o?.stripeMode">
    <div v-if="error" class="py-10">
      <AppEmptyState title="Couldn't load the overview" :description="error.statusMessage || error.message" icon="lucide:triangle-alert" />
    </div>

    <template v-else>
      <div v-for="w in o?.warnings ?? []" :key="w" class="mb-4 rounded-xl bg-warning/15 px-4 py-3 type-meta text-warning">{{ w }}</div>

      <!-- Money -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AppStatCard label="MRR" :value="money(o?.revenue?.mrrCents)" icon="lucide:repeat" accent="emerald" :loading="pending" :description="o?.revenue ? `${o.revenue.activeSubscriptions} active subscriptions` : undefined" />
        <AppStatCard label="ARR" :value="money(o?.revenue?.arrCents)" icon="lucide:calendar-range" accent="blue" :loading="pending" />
        <AppStatCard label="Past due (at risk / mo)" :value="money(o?.revenue?.atRiskMrrCents)" icon="lucide:alert-circle" accent="amber" :loading="pending" />
        <AppStatCard
          label="Failed payments, 30 days"
          :value="o?.failedPayments ? o.failedPayments.events : '—'"
          icon="lucide:credit-card"
          accent="rose"
          :loading="pending"
          :description="o?.failedPayments ? `${o.failedPayments.invoices} invoices` : undefined"
        />
      </div>

      <!-- Communities by status -->
      <section class="mt-6">
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <h2 class="type-section t-text">Communities <span class="t-text-muted">{{ c?.total ?? "" }}</span></h2>
          <p class="type-meta t-text-muted">
            Signups: {{ o?.signups?.last7 ?? "—" }} in 7 days · {{ o?.signups?.last30 ?? "—" }} in 30
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <NuxtLink
            v-for="b in buckets"
            :key="b.key"
            :to="{ path: '/ops/communities', query: { filter: b.filter } }"
            class="ios-card block p-3 transition-opacity hover:opacity-80"
          >
            <p :class="['type-display tabular-nums', b.tone]">{{ b.value }}</p>
            <p class="type-meta t-text-muted">{{ b.label }}</p>
          </NuxtLink>
        </div>
      </section>

      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <!-- Stripe subscriptions -->
        <section class="ios-card p-4">
          <h2 class="type-card t-text">Subscriptions in Stripe</h2>
          <ul v-if="subStatuses.length" class="mt-2 space-y-1.5">
            <li v-for="[status, n] in subStatuses" :key="status" class="flex items-center justify-between">
              <OpsStatusPill :status="status" />
              <span class="type-body tabular-nums t-text">{{ n }}</span>
            </li>
          </ul>
          <p v-else class="mt-2 type-meta t-text-muted">{{ pending ? "Loading…" : "None found for HOA Connect." }}</p>
          <p v-if="o?.revenue?.unpricedItems" class="mt-2 type-micro text-warning">
            {{ o.revenue.unpricedItems }} item(s) have no flat price and aren't in MRR.
          </p>
        </section>

        <!-- Discount codes -->
        <section class="ios-card p-4">
          <h2 class="type-card t-text">Discount codes</h2>
          <p class="type-meta t-text-muted">{{ o?.discounts?.redemptions ?? "—" }} redemptions</p>
          <ul v-if="o?.discounts?.codes?.length" class="mt-2 space-y-1.5">
            <li v-for="code in o.discounts.codes" :key="code.id" class="flex items-center justify-between gap-2">
              <span class="min-w-0 truncate font-mono type-meta t-text" :class="{ 'line-through opacity-60': !code.active }">{{ code.code }}</span>
              <span class="type-micro t-text-muted whitespace-nowrap">
                {{ code.percentOff ? `${code.percentOff}%` : money(code.amountOff) }} {{ code.duration }} ·
                {{ code.timesRedeemed }}<template v-if="code.maxRedemptions">/{{ code.maxRedemptions }}</template> used
              </span>
            </li>
          </ul>
          <p v-else-if="!pending" class="mt-2 type-meta t-text-muted">HOA Connect has no discount codes in this Stripe mode.</p>
        </section>

        <!-- Webhook health -->
        <section class="ios-card p-4">
          <h2 class="type-card t-text">Webhook health</h2>
          <template v-if="o?.webhooks">
            <p v-if="o.webhooks.undelivered === 0" class="mt-1 type-meta text-success">Every HOA Connect event in the last 7 days was delivered.</p>
            <template v-else>
              <p class="mt-1 type-meta text-warning">
                {{ o.webhooks.undelivered }} event(s) not yet delivered · oldest {{ relativeDays(o.webhooks.oldestAt) }}
              </p>
              <ul class="mt-2 space-y-1">
                <li v-for="(n, type) in o.webhooks.types" :key="type" class="flex justify-between type-micro t-text-muted">
                  <span class="font-mono">{{ type }}</span><span>{{ n }}</span>
                </li>
              </ul>
            </template>
          </template>
          <p v-else class="mt-1 type-meta t-text-muted">{{ pending ? "Loading…" : "Unavailable." }}</p>
        </section>
      </div>

      <div class="mt-6 flex items-center justify-between gap-2">
        <p class="type-micro t-text-muted">Stripe figures are cached for a minute. {{ o?.generatedAt ? `Updated ${new Date(o.generatedAt).toLocaleTimeString()}` : "" }}</p>
        <Button variant="ghost" size="sm" :disabled="pending" @click="refresh()">Refresh</Button>
      </div>
    </template>
  </OpsShell>
</template>
