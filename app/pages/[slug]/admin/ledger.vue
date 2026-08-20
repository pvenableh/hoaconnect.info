<script setup lang="ts">
// The board's view of the Community Ledger. Same component and same API as the
// owner-facing `/{slug}/ledger` — the route only changes the framing, never the
// data, which is narrowed per viewer by core/shared/ledger/visibility.ts.
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});
</script>

<template>
  <PagesCommunityLedgerPage
    eyebrow="Records"
    subtitle="What happened to your community, in the order it happened. Every entry is permanent — corrections are new entries, never edits. Entries marked board only are hidden from owners."
  />
</template>
