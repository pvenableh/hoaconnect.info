<template>
  <div class="">
    {{ selectedOrgId }}

    <AdminCustomDomainSetup :hoaId="selectedOrgId" />

    {{ currentOrg }}
  </div>
</template>
<script setup lang="ts">
const { selectedOrgId, currentOrg } = useSelectedOrg();
definePageMeta({
  middleware: "auth",
  layout: "auth",
});
</script>
