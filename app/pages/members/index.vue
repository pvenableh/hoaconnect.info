<script setup lang="ts">
/**
 * Root-level members page - redirects to org-specific admin members page
 * This is used when users navigate to /members from the main domain
 */
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { user } = useDirectusAuth();
const { isCustomDomain } = useActiveHoa();
const { currentOrg } = user.value ? await useSelectedOrg() : { currentOrg: ref(null) };

// Redirect to org-specific admin members page
if (currentOrg.value?.organization?.slug) {
  // On custom domains, don't include slug in URL
  const basePath = isCustomDomain.value ? '' : `/${currentOrg.value.organization.slug}`;
  await navigateTo(`${basePath}/admin/members`);
}
</script>

<template>
  <PagesMembersPage />
</template>
