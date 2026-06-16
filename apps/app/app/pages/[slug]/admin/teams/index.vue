<script setup lang="ts">
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <BackLink :to="buildOrgPath('/admin/requests')" label="Requests" />

      <div>
        <h1 class="text-2xl font-semibold t-text">Teams</h1>
        <p class="text-sm t-text-muted mt-0.5">
          Create named teams and empower members to manage a domain.
        </p>
      </div>

      <TeamsTeamManager />
    </PageContainer>
  </div>
</template>
