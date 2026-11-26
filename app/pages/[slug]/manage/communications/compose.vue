<script setup lang="ts">
// The composer for a property manager, helper or committee holding the
// communications area (docs/spec-delegation.md). Every read and the send go
// through routes behind requireAreaWork; admins use /admin/communications.
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
  managerCapability: "communications",
});

const route = useRoute();
const emailId = computed(() => route.query.id as string | undefined);
const audience = computed(() => {
  const a = route.query.audience as string | undefined;
  return a === "owners" || a === "tenants" || a === "all" ? a : undefined;
});
</script>

<template>
  <PagesEmailComposePage :email-id="emailId" :audience="audience" />
</template>
