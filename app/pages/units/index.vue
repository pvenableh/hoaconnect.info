<script setup lang="ts">
/**
 * Root-level units page - redirects to org-specific admin units page
 * This is used when users navigate to /units from the main domain
 */
definePageMeta({
  middleware: "admin",
  layout: "auth",
});

const { user } = useDirectusAuth();
const { currentOrg } = user.value ? await useSelectedOrg() : { currentOrg: ref(null) };

// Redirect to org-specific admin units page
if (currentOrg.value?.organization?.slug) {
  await navigateTo(`/${currentOrg.value.organization.slug}/admin/units`);
}
</script>

<template>
  <PagesUnitsPage />
</template>
