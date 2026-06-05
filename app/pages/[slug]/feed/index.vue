<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId, isAdmin, isBoardMember, isMember } = await useSelectedOrg();
const isBoard = computed(() => isAdmin.value || isBoardMember.value);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <div class="p-6 max-w-2xl mx-auto space-y-6">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h1 class="text-2xl font-semibold t-text">Building</h1>
          <p class="text-sm t-text-muted mt-0.5">
            Everything happening in your community — react and join the conversation.
          </p>
        </div>
        <NuxtLink :to="buildOrgPath('/polls')">
          <Button variant="outline" class="rounded-full">
            <Icon name="lucide:bar-chart-3" class="w-4 h-4 mr-1.5" />
            Polls
          </Button>
        </NuxtLink>
      </div>

      <FeedActivityFeed
        :organization-id="selectedOrgId"
        :is-board="isBoard"
        :is-member="isMember"
      />
    </div>
  </div>
</template>
