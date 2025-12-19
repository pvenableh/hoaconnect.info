<script setup lang="ts">
/**
 * Root-level documents upload page - redirects to org-specific admin documents upload
 * This is used when users navigate to /documents/upload from the main domain
 */
definePageMeta({
  middleware: "admin",
  layout: "auth",
});

const { user } = useDirectusAuth();
const { isCustomDomain } = useActiveHoa();
const { currentOrg } = user.value ? await useSelectedOrg() : { currentOrg: ref(null) };

// Redirect to org-specific admin documents upload page
if (currentOrg.value?.organization?.slug) {
  // On custom domains, don't include slug in URL
  const basePath = isCustomDomain.value ? '' : `/${currentOrg.value.organization.slug}`;
  await navigateTo(`${basePath}/admin/documents/upload`);
}
</script>

<template>
  <PagesDocumentsUploadPage />
</template>
