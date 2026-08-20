<script setup lang="ts">
// The owner-facing Community Ledger — a WORKSPACE page (like /board and
// /rules): logged-in members reach it through the normal chrome rather than a
// chromeless public page. VISION Pillar B's promise is that an owner can see
// what their board decided and what their manager did WITHOUT asking
// permission, which only means anything if owners have their own door to it.
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});
</script>

<template>
  <PagesCommunityLedgerPage
    eyebrow="Your community"
    subtitle="What has happened to your community, in the order it happened. Nothing here can be edited or deleted — corrections are new entries."
  />
</template>
