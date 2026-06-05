<script setup lang="ts">
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <div class="p-6 max-w-3xl mx-auto space-y-6">
      <NuxtLink
        :to="buildOrgPath('/admin/requests')"
        class="inline-flex items-center gap-1.5 text-sm t-text-muted hover:t-text transition-colors"
      >
        <Icon name="lucide:arrow-left" class="w-4 h-4" />
        Requests
      </NuxtLink>

      <div>
        <h1 class="text-2xl font-semibold t-text">Committees</h1>
        <p class="text-sm t-text-muted mt-0.5">
          Empower non-board members to manage a specific domain.
        </p>
      </div>

      <CommitteesCommitteeManager />
    </div>
  </div>
</template>
