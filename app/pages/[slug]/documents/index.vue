<script setup lang="ts">
definePageMeta({
  middleware: "auth",
  layout: "auth",
});

const route = useRoute();
const { user } = useDirectusAuth();

// Get role info for logged-in users
const { isAdmin } = user.value
  ? await useSelectedOrg()
  : { isAdmin: ref(false) };

// Redirect admins to the admin documents page
if (isAdmin.value) {
  await navigateTo(`/${route.params.slug}/admin/documents`);
}
</script>

<template>
  <!-- Members see simplified accordion view (admins are redirected above) -->
  <PagesMemberDocumentsPage />
</template>
