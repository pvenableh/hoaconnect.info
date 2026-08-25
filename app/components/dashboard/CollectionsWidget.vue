<script setup lang="ts">
/**
 * Dashboard widget — money in, by month.
 *
 * The read moved to `useHomeGlances` in Phase 7: the stacks home's rails ask
 * the same question, and running a second `payment_requests` query for them is
 * exactly what the plan forbids. The composable is keyed shared state, so this
 * widget and the rails together make ONE request — and a dashboard where this
 * widget is switched off still costs nothing extra, because the rails were
 * going to run that query anyway.
 */
import { money } from "#core/shared/home/glances";

const { months, collected12mo, hasCollections, pending } = await useMoneyGlance();

const SERIES = [{ key: "collected", label: "Collected", color: "var(--chart-1)" }];
</script>

<template>
  <AppChartCard
    title="Collections"
    :hint="hasCollections ? `${money(collected12mo)} collected over 12 months` : 'Money in, by month'"
    icon="lucide:trending-up"
    :loading="pending"
    :empty="!hasCollections"
    empty-title="No payments recorded"
    empty-hint="Once a charge is paid, the months fill in."
    :height="200"
  >
    <AppChartTrend
      :data="months"
      :series="SERIES"
      area
      :height="200"
      :format="money"
      hide-legend
    />
  </AppChartCard>
</template>
