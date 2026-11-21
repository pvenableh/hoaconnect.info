<script setup lang="ts">
/**
 * HomeAckPending — the admin's and board's "who has not acknowledged" list, one
 * block per live notice. The server route checks the admin or board hat for this
 * organization (`/api/org/acknowledgments/pending`); a refusal renders nothing.
 */
const props = defineProps<{ organizationId: string | null | undefined }>();

interface PendingNotice {
  id: string;
  title: string;
  ackDue: string | null;
  pending: Array<{ memberId: string; name: string; residency: string }>;
}
const { data } = await useAsyncData(
  () => `home-ack-pending-${props.organizationId}`,
  async () =>
    props.organizationId
      ? await $fetch<{ notices: PendingNotice[] }>("/api/org/acknowledgments/pending", { query: { orgId: props.organizationId } }).catch(() => ({ notices: [] }))
      : { notices: [] },
  { watch: [() => props.organizationId], server: false, default: () => ({ notices: [] as PendingNotice[] }) }
);
const notices = computed(() => data.value?.notices ?? []);
</script>

<template>
  <div v-if="notices.length" class="space-y-3" data-testid="home-ack-pending">
    <h2 class="t-eyebrow">Waiting on acknowledgment</h2>
    <AppCard v-for="n in notices" :key="n.id" class="p-4" data-testid="home-ack-pending-notice">
      <p class="text-sm font-medium t-text">{{ n.title }}</p>
      <p v-if="n.pending.length" class="text-sm t-text-muted">
        {{ n.pending.length }} {{ n.pending.length === 1 ? "person has" : "people have" }} not acknowledged
      </p>
      <p v-else class="text-sm t-text-muted">Everyone has acknowledged.</p>
      <ul v-if="n.pending.length" class="mt-2 flex flex-wrap gap-1.5">
        <li v-for="p in n.pending" :key="p.memberId" class="rounded-full border px-2.5 py-0.5 text-xs t-text">{{ p.name }}</li>
      </ul>
    </AppCard>
  </div>
</template>
