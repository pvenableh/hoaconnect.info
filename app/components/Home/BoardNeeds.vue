<script setup lang="ts">
/**
 * HomeBoardNeeds — band 1 for a board member: money approvals waiting, each
 * with a signature Ring (decisions so far against the number needed). Approve
 * or decline in the card; the server decides again (as on the Approvals page).
 */
import { toast } from "vue-sonner";
import { approvalHeadline } from "#core/shared/money/approval-headline";

interface Item {
  id: string;
  kind: string;
  state: string;
  needed: number;
  approvals: number;
  progress: string;
  canDecide: boolean;
  waiting_on: { name: string }[];
  subject: any;
}

const orgId = useState<string | null>("selectedOrgId", () => null);
const { buildOrgPath } = useOrgNavigation();
const { prompt } = useConfirm();
const chargePanel = useAppSlideOver("charge");
const busy = ref<string | null>(null);
// A charge opens over the home; an expense has no panel, so it goes to Approvals.
const openRecord = (a: Item, e: Event) => {
  if (a.subject?.type === "charge") {
    e.preventDefault();
    chargePanel.open(a.subject.id);
  }
};

const { data, pending, refresh } = useAsyncData(
  () => `board-home-approvals-${orgId.value}`,
  async () =>
    orgId.value
      ? await $fetch<{ approvals: Item[] }>("/api/org/money/approvals", { query: { orgId: orgId.value, view: "open" } }).catch(() => ({ approvals: [] as Item[] }))
      : { approvals: [] as Item[] },
  { watch: [orgId], server: false },
);
const items = computed(() => (data.value?.approvals ?? []).slice(0, 5));
const total = computed(() => data.value?.approvals.length ?? 0);

const decide = async (a: Item, decision: "approve" | "reject") => {
  const head = approvalHeadline(a.kind, a.subject);
  const note = await prompt({
    title: decision === "approve" ? "Approve this?" : "Reject this?",
    body: head,
    label: "Note (optional)",
    multiline: true,
    maxLength: 1000,
    confirmLabel: decision === "approve" ? "Approve" : "Reject",
    destructive: decision === "reject",
  });
  if (note === null) return;
  busy.value = a.id;
  try {
    await $fetch(`/api/org/money/approvals/${a.id}/decide`, {
      method: "POST",
      body: { orgId: orgId.value, decision, note: note || null },
    });
    toast.success(decision === "approve" ? "Approved" : "Rejected");
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "That didn't work");
  } finally {
    busy.value = null;
    await refresh();
  }
};
</script>

<template>
  <div class="space-y-3" data-testid="home-board-approvals">
    <h2 class="t-eyebrow">Needs you</h2>
    <AppCard class="overflow-hidden py-0">
      <ul class="divide-y">
        <li v-for="a in items" :key="a.id" class="flex items-center gap-3 px-4 py-3" data-testid="home-approval-row">
          <AppChartRing :value="a.approvals" :max="a.needed || 1" :size="44" :format="() => a.progress" label="Signatures" />
          <NuxtLink :to="buildOrgPath('/approvals')" class="min-w-0 flex-1" @click="openRecord(a, $event)">
            <span class="block truncate text-sm font-medium t-text">{{ approvalHeadline(a.kind, a.subject) }}</span>
            <span class="block truncate text-sm t-text-muted">
              {{ a.progress }}<template v-if="a.waiting_on.length"> · waiting on {{ a.waiting_on.map((p) => p.name).join(", ") }}</template>
            </span>
          </NuxtLink>
          <template v-if="a.canDecide">
            <AppButton size="sm" variant="outline" :disabled="busy === a.id" @click="decide(a, 'reject')">Decline</AppButton>
            <AppButton size="sm" :disabled="busy === a.id" @click="decide(a, 'approve')">Approve</AppButton>
          </template>
        </li>
        <li v-if="!items.length" class="px-4 py-3 text-sm t-text-muted">
          {{ pending ? "Loading approvals…" : "No approvals are waiting." }}
        </li>
      </ul>
    </AppCard>
    <NuxtLink v-if="total > items.length" :to="buildOrgPath('/approvals')" class="text-sm font-medium t-text-secondary">All {{ total }} waiting</NuxtLink>
  </div>
</template>
