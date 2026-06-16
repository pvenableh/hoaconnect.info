<script setup lang="ts">
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const route = useRoute();
const emailId = computed(() => route.query.id as string | undefined);
</script>

<template>
  <PagesEmailComposePage :email-id="emailId" />
</template>
