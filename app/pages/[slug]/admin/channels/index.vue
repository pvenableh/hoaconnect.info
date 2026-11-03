<script setup lang="ts">
definePageMeta({
  middleware: ["channel-access", "subscription"],
  layout: "auth",
  // Full height inside the workspace shell: the footer hides, the dock stays.
  immersive: true,
  // No route animation when switching channels — just swap the content.
  pageTransition: false,
});

// Org id from the awaited selected-org state — the reliable, app-wide source the
// rest of /[slug]/admin uses (activeHoa can be briefly null on client nav).
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();

const orgName = computed(() => currentOrg.value?.organization?.name || "Channels");
</script>

<template>
  <div class="h-full min-h-0">
    <ClientOnly>
      <template #fallback>
        <div class="h-full flex items-center justify-center"><div class="spinner-ios" /></div>
      </template>
      <ChannelsWorkspace
        v-if="selectedOrgId"
        :organization-id="selectedOrgId"
        :org-name="orgName"
        :is-admin="isAdminOfCurrentDomain"
      />
    </ClientOnly>
  </div>
</template>
