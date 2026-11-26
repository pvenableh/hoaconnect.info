<script setup lang="ts">
// One email, for whoever works the communications area (docs/spec-delegation.md).
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
  managerCapability: "communications",
});

const route = useRoute();
const emailId = computed(() => route.params.id as string);
</script>

<template>
  <PagesEmailDetailPage :email-id="emailId" />
</template>
