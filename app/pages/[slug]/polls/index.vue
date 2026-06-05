<script setup lang="ts">
import type { Poll } from "~/composables/usePolls";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { isAdmin, isBoardMember } = await useSelectedOrg();
const { listOrgPolls } = usePolls();

const canManage = computed(() => isAdmin.value || isBoardMember.value);
const showNew = ref(false);

const { data: polls, pending, refresh } = await useAsyncData(
  "org-polls",
  () => listOrgPolls(["open", "closed", "draft"]).then((p) => p as Poll[]),
  { server: false, default: () => [] as Poll[] }
);

const openPolls = computed(() => (polls.value || []).filter((p) => p.status !== "closed"));
const closedPolls = computed(() => (polls.value || []).filter((p) => p.status === "closed"));

const onCreated = async () => {
  showNew.value = false;
  await refresh();
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h1 class="text-2xl font-semibold t-text">Polls</h1>
          <p class="text-sm t-text-muted mt-0.5">Community feedback & votes.</p>
        </div>
        <Button v-if="canManage" class="rounded-full" @click="showNew = !showNew">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> New poll
        </Button>
      </div>

      <div v-if="showNew" class="ios-card p-6">
        <PollsPollForm @created="onCreated" @cancel="showNew = false" />
      </div>

      <div v-if="pending" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

      <template v-else>
        <div v-if="openPolls.length" class="space-y-4">
          <PollsPollCard
            v-for="poll in openPolls"
            :key="poll.id"
            :poll="poll"
            :can-manage="canManage"
            @changed="refresh"
          />
        </div>

        <div v-if="closedPolls.length" class="space-y-4">
          <h2 class="text-sm font-medium t-text-muted pt-2">Closed</h2>
          <PollsPollCard
            v-for="poll in closedPolls"
            :key="poll.id"
            :poll="poll"
            :can-manage="canManage"
            @changed="refresh"
          />
        </div>

        <div v-if="!openPolls.length && !closedPolls.length" class="py-20 text-center">
          <div class="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
            <Icon name="lucide:bar-chart-3" class="w-7 h-7 text-stone-400" />
          </div>
          <p class="text-stone-500">No polls yet.</p>
        </div>
      </template>
    </PageContainer>
  </div>
</template>
