<script setup lang="ts">
/**
 * Root-level documents page - redirects to org-specific documents page
 * Admins go to admin documents, members go to member documents view
 */
definePageMeta({
  middleware: "auth",
  layout: "auth",
});

const { user } = useDirectusAuth();

// Get role info for logged-in users
const { isAdmin, currentOrg } = user.value
  ? await useSelectedOrg()
  : { isAdmin: ref(false), currentOrg: ref(null) };

// Redirect to org-specific documents page
if (currentOrg.value?.organization?.slug) {
  if (isAdmin.value) {
    await navigateTo(`/${currentOrg.value.organization.slug}/admin/documents`);
  } else {
    await navigateTo(`/${currentOrg.value.organization.slug}/documents`);
  }
}
</script>

<template>
  <!-- Fallback content while redirecting -->
  <PagesMemberDocumentsPage />
</template>
