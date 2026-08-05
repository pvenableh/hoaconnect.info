<script setup lang="ts">
// An amber "Stripe test mode" pill, shown only when the instance transacts against
// TEST Stripe (STRIPE_MODE=test / non-prod). Renders nothing in live mode. Exists to
// make test dry-runs unmistakable — especially when running test mode on the prod URL.
const testMode = computed(() => useRuntimeConfig().public.stripeTestMode === true);
</script>

<template>
  <span
    v-if="testMode"
    class="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-2.5 py-1 text-xs font-semibold"
    title="Stripe is in test mode — no real charges. Use test cards (e.g. 4242 4242 4242 4242)."
  >
    <Icon name="lucide:flask-conical" class="w-3.5 h-3.5" />
    Stripe test mode
  </span>
</template>
