<script setup lang="ts">
import type { Poll } from "#core/app/composables/usePolls";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { fetchOrgPolls } = usePolls();

const showNew = ref(false);

// The route decides who may run these — including a property manager on this
// community's `feedback` grant, which no role check on this page could see.
// Asking it, rather than inferring from isAdmin/isBoardMember, is what keeps the
// page and the routes that enforce it from drifting apart.
const { data, pending, refresh } = await useAsyncData(
  "org-polls",
  () => fetchOrgPolls(["open", "closed", "draft"]),
  {
    server: false,
    default: () => ({
      polls: [] as Poll[],
      viewer: { canManage: false, canVote: false, viaGrant: false },
    }),
  }
);

const polls = computed(() => data.value?.polls ?? []);
const canManage = computed(() => data.value?.viewer?.canManage === true);
const viaGrant = computed(() => data.value?.viewer?.viaGrant === true);

const openPolls = computed(() => polls.value.filter((p) => p.status !== "closed"));
const closedPolls = computed(() => polls.value.filter((p) => p.status === "closed"));

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
          <p class="text-sm t-text-muted mt-0.5">
            Community feedback &amp; votes.
            <span v-if="viaGrant">
              You can see these because this community granted your management
              company access to its feedback.
            </span>
          </p>
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
          <div class="w-14 h-14 rounded-full t-bg-subtle flex items-center justify-center mx-auto mb-3">
            <Icon name="lucide:bar-chart-3" class="w-7 h-7 t-text-muted" />
          </div>
          <p class="t-text-muted">No polls yet.</p>
        </div>
      </template>
    </PageContainer>
  </div>
</template>
