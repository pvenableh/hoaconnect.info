<script setup lang="ts">
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const route = useRoute();
const emailId = computed(() => route.query.id as string | undefined);
// Optional recipient preset from the Audience tab deep-links.
const audience = computed(() => {
  const a = route.query.audience as string | undefined;
  return a === "owners" || a === "tenants" || a === "all" ? a : undefined;
});
</script>

<template>
  <PagesEmailComposePage :email-id="emailId" :audience="audience" />
</template>
