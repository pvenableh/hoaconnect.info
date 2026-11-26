<!--
  ApprovalPanel — one money approval over the page (?slide=approval:<id>).
  The board home opens it for an expense, which has no record panel of its own
  (a charge opens the charge panel). It reads GET /api/org/money/approvals/[id]
  and decides through the same route as the Approvals page, so the rule and
  who may decide are settled on the server.
-->
<script setup lang="ts">
import { toast } from "vue-sonner";
import type { FlipFromPayload } from "#core/app/composables/useFlipFromRow";
import { approvalHeadline } from "#core/shared/money/approval-headline";

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null; page?: string | null }>();
defineEmits<{ (e: "close"): void }>();

interface Decision { id: string; decision: string; note: string | null; date_created: string | null; office: string | null; name: string }
interface Approval {
  id: string;
  kind: string;
  state: string;
  needed: number;
  approvals: number;
  progress: string;
  reason: string | null;
  canDecide: boolean;
  requested_by: { name: string } | null;
  waiting_on: { name: string }[];
  decisions: Decision[];
  subject: any;
}

const orgId = useState<string | null>("selectedOrgId", () => null);
const { prompt } = useConfirm();
const approval = ref<Approval | null>(null);
const loading = ref(true);
const failed = ref<string | null>(null);
const busy = ref(false);

async function load() {
  loading.value = true;
  failed.value = null;
  try {
    approval.value = (await $fetch<{ approval: Approval }>(`/api/org/money/approvals/${props.id}`, { query: { orgId: orgId.value } })).approval;
  } catch (e: any) {
    approval.value = null;
    failed.value = e?.data?.message || "This approval could not be loaded.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const headline = computed(() => (approval.value ? approvalHeadline(approval.value.kind, approval.value.subject) : "Approval"));
const money = (v?: number | null) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

async function decide(decision: "approve" | "reject") {
  if (!approval.value) return;
  const note = await prompt({
    title: decision === "approve" ? "Approve this?" : "Reject this?",
    body: headline.value,
    label: "Note (optional)",
    multiline: true,
    maxLength: 1000,
    confirmLabel: decision === "approve" ? "Approve" : "Reject",
    destructive: decision === "reject",
  });
  if (note === null) return;
  busy.value = true;
  try {
    await $fetch(`/api/org/money/approvals/${props.id}/decide`, { method: "POST", body: { orgId: orgId.value, decision, note: note || null } });
    toast.success(decision === "approve" ? "Approved" : "Rejected");
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "That didn't work");
  } finally {
    busy.value = false;
    await load();
  }
}
</script>

<template>
  <AppSlideOverShell :title="headline" subtitle="Approval" :flip-from="flipFrom" :page="page" @close="$emit('close')">
    <div v-if="loading" class="py-16 flex justify-center"><div class="spinner-ios" /></div>
    <p v-else-if="failed" class="text-sm t-text-muted">{{ failed }}</p>

    <div v-else-if="approval" class="space-y-6" data-testid="approval-panel">
      <div class="flex items-center gap-4">
        <AppChartRing :value="approval.approvals" :max="approval.needed || 1" :size="64" :format="() => `${approval!.approvals}/${approval!.needed}`" label="Signatures" />
        <div class="min-w-0">
          <p class="text-sm font-medium t-text">{{ approval.progress }}</p>
          <p v-if="approval.waiting_on.length" class="text-sm t-text-muted">Waiting on {{ approval.waiting_on.map((p) => p.name).join(", ") }}</p>
          <p v-if="approval.requested_by" class="text-xs t-text-muted">Asked by {{ approval.requested_by.name }}</p>
        </div>
      </div>

      <dl v-if="approval.subject?.type === 'expense'" class="grid grid-cols-2 gap-3 text-sm">
        <div><dt class="text-xs t-text-muted">Vendor</dt><dd class="t-text">{{ approval.subject.vendor || "—" }}</dd></div>
        <div><dt class="text-xs t-text-muted">Amount</dt><dd class="t-text tabular-nums">{{ money(approval.subject.amount) }}</dd></div>
        <div class="col-span-2"><dt class="text-xs t-text-muted">For</dt><dd class="t-text">{{ approval.subject.title || "—" }}</dd></div>
      </dl>
      <p v-if="approval.reason" class="text-sm t-text"><span class="t-text-muted">Reason:</span> {{ approval.reason }}</p>

      <div>
        <h3 class="t-eyebrow mb-2">Decisions</h3>
        <ul v-if="approval.decisions.length" class="divide-y rounded-lg border">
          <li v-for="d in approval.decisions" :key="d.id" class="px-3 py-2 text-sm">
            <span class="font-medium t-text">{{ d.name }}</span>
            <span v-if="d.office" class="t-text-muted"> · {{ d.office }}</span>
            <span class="t-text-muted"> · {{ d.decision === "approve" ? "approved" : "rejected" }} {{ when(d.date_created) }}</span>
            <p v-if="d.note" class="t-text-muted">{{ d.note }}</p>
          </li>
        </ul>
        <p v-else class="text-sm t-text-muted">Waiting for the first decision.</p>
      </div>

      <div v-if="approval.canDecide" class="flex gap-2">
        <AppButton variant="outline" :disabled="busy" @click="decide('reject')">Decline</AppButton>
        <AppButton :disabled="busy" @click="decide('approve')">Approve</AppButton>
      </div>
    </div>
  </AppSlideOverShell>
</template>
