<script setup lang="ts">
// Operator console: agency billing accounts (plan §5, Phase 1). Stripe's
// quantity against the communities actually attached, and who manages each.
import { BILLING_ROLE, money, shortDate } from "#core/shared/ops/format";

definePageMeta({ middleware: ["auth"], layout: "auth" });
useHead({ title: "Agencies · Operations" });

const { data, pending, error } = await useFetch<any>("/api/ops/billing-accounts");
const accounts = computed(() => data.value?.accounts ?? []);
</script>

<template>
  <OpsShell title="Agency billing accounts" description="Management companies paying for several communities on one subscription.">
    <p v-if="data?.warning" class="mb-4 rounded-xl bg-warning/15 px-4 py-2 type-meta text-warning">{{ data.warning }}</p>

    <div v-if="error" class="py-10">
      <AppEmptyState title="Couldn't load billing accounts" :description="error.statusMessage || error.message" icon="lucide:triangle-alert" />
    </div>
    <div v-else-if="pending && !data" class="py-16 text-center type-meta t-text-muted">Loading…</div>
    <div v-else-if="!accounts.length" class="py-10">
      <AppEmptyState title="No agency billing accounts yet" description="Every community pays for itself today." icon="lucide:briefcase" />
    </div>

    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section v-for="a in accounts" :key="a.id" class="ios-card p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="truncate type-card t-text">{{ a.name }}</h2>
            <p class="type-micro t-text-muted">
              <template v-if="a.status === 'trial' && a.trialEndsAt">Trial ends {{ shortDate(a.trialEndsAt) }} · </template>
              {{ money(a.monthlyValueCents) }} / month
            </p>
          </div>
          <OpsStatusPill :status="a.status" />
        </div>

        <dl class="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><dt class="type-micro t-text-muted">Stripe quantity</dt><dd class="type-section tabular-nums t-text">{{ a.stripeQuantity ?? "—" }}</dd></div>
          <div><dt class="type-micro t-text-muted">Attached</dt><dd class="type-section tabular-nums t-text">{{ a.attachedCount }}</dd></div>
          <div><dt class="type-micro t-text-muted">Seats on record</dt><dd class="type-section tabular-nums t-text">{{ a.seatsPurchased ?? "—" }}</dd></div>
        </dl>
        <p v-if="a.quantityMismatch" class="mt-2 rounded-lg bg-warning/15 px-3 py-1.5 type-micro text-warning">
          Stripe bills for {{ a.stripeQuantity }} but {{ a.attachedCount }} are attached. A seat sync may have failed.
        </p>

        <p class="mt-4 type-label t-text-muted">Communities</p>
        <ul class="mt-1 divide-y divide-[var(--theme-border-light)]">
          <li v-for="c in a.communities" :key="c.id" class="flex items-center justify-between gap-2 py-1.5">
            <NuxtLink :to="`/ops/communities/${c.id}`" class="min-w-0 truncate type-meta t-text hover:underline">{{ c.name }}</NuxtLink>
            <span class="type-micro t-text-muted whitespace-nowrap">{{ c.realUnits }} units</span>
          </li>
          <li v-if="!a.communities.length" class="py-1.5 type-micro t-text-muted">None attached.</li>
        </ul>

        <p class="mt-4 type-label t-text-muted">Members</p>
        <ul class="mt-1 divide-y divide-[var(--theme-border-light)]">
          <li v-for="m in a.members" :key="m.id" class="flex items-center justify-between gap-2 py-1.5">
            <span class="min-w-0">
              <span class="block truncate type-meta t-text">{{ m.name || "—" }}</span>
              <a v-if="m.email" :href="`mailto:${m.email}`" class="block truncate type-micro t-text-muted hover:underline">{{ m.email }}</a>
            </span>
            <span class="type-micro t-text-muted whitespace-nowrap">{{ BILLING_ROLE[m.role] ?? m.role }}</span>
          </li>
        </ul>

        <Button v-if="a.stripeUrl" as="a" :href="a.stripeUrl" target="_blank" rel="noopener" variant="outline" size="sm" class="mt-3">Stripe customer</Button>
      </section>
    </div>
  </OpsShell>
</template>
