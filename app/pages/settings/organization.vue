<script setup lang="ts">
/**
 * Root-level organization settings page - redirects to org-specific admin settings
 * This is used when users navigate to /settings/organization from the main domain
 */
definePageMeta({
  middleware: "admin",
  layout: "auth",
});

const { user } = useDirectusAuth();
const { currentOrg } = user.value ? await useSelectedOrg() : { currentOrg: ref(null) };

// Redirect to org-specific admin settings page
if (currentOrg.value?.organization?.slug) {
  await navigateTo(`/${currentOrg.value.organization.slug}/admin/settings/organization`);
}
</script>

<template>
  <PagesSettingsOrganizationPage />
</template>
