<script setup lang="ts">
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const route = useRoute();
const emailId = computed(() => route.params.id as string);
</script>

<template>
  <PagesEmailDetailPage :email-id="emailId" />
</template>
