<script setup lang="ts">
/**
 * Manager directory — read-only member list. Page access requires the
 * "directory" area; the list comes from /api/org/directory, which checks it
 * again and reads with the app's token, so a helper holding the area sees what
 * a manager sees (docs/spec-delegation.md).
 */
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
  managerCapability: "directory",
});

const { selectedOrgId } = await useSelectedOrg();

const { data: members, pending } = await useAsyncData(
  `manage-directory-${selectedOrgId.value}`,
  () =>
    $fetch<{ members: any[] }>("/api/org/directory", { query: { orgId: selectedOrgId.value } }).then((r) => r.members),
  { watch: [selectedOrgId], server: false }
);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <h1 class="text-2xl font-semibold t-text">Directory</h1>

      <div v-if="pending" class="py-16 text-center t-text-muted">Loading…</div>
      <div v-else-if="!members?.length" class="py-16 text-center t-text-muted">No members found.</div>
      <div v-else class="ios-card divide-y">
        <div v-for="m in members" :key="m.id" class="flex items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <div class="font-medium t-text truncate">{{ (m.first_name || "") + " " + (m.last_name || "") }}</div>
            <div class="text-sm t-text-muted truncate">
              {{ m.email || "—" }}<span v-if="m.phone"> · {{ m.phone }}</span>
            </div>
          </div>
          <span v-if="m.member_type" class="text-xs px-2 py-0.5 rounded-full t-bg-subtle t-text-secondary shrink-0 capitalize">{{ m.member_type }}</span>
        </div>
      </div>
    </PageContainer>
  </div>
</template>
