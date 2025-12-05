<script setup lang="ts">
/**
 * Root-level members page - redirects to org-specific admin members page
 * This is used when users navigate to /members from the main domain
 */
definePageMeta({
  middleware: "admin",
  layout: "auth",
});

const { user } = useDirectusAuth();
const { currentOrg } = user.value ? await useSelectedOrg() : { currentOrg: ref(null) };

// Redirect to org-specific admin members page
if (currentOrg.value?.organization?.slug) {
  await navigateTo(`/${currentOrg.value.organization.slug}/admin/members`);
}
</script>

<template>
  <PagesMembersPage />
</template>
