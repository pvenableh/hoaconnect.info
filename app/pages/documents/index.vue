<script setup lang="ts">
definePageMeta({
  middleware: "auth",
  layout: "auth",
});

const { user } = useDirectusAuth();

// Get role info for logged-in users
const { isAdmin } = user.value
  ? await useSelectedOrg()
  : { isAdmin: ref(false) };
</script>

<template>
  <!-- Admin sees full document management -->
  <PagesDocumentsPage v-if="isAdmin" />
  <!-- Members see simplified accordion view -->
  <PagesMemberDocumentsPage v-else />
</template>
