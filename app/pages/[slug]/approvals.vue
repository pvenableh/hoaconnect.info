<script setup lang="ts">
/**
 * Approvals — money waiting on the board (docs/spec-money-approvals.md,
 * registry entry `money-approvals`, needs money:read).
 *
 * Every board seat sees what is waiting, who has decided and what each item
 * still needs. Approve and Reject show only where the server says
 * `canDecide`, and the server decides again on POST: the rule
 * (core/shared/money/approval-rule.ts) waits on two of the operating
 * committee, or a board majority, never on whoever asked or reshaped it, and
 * never on an admin as an admin.
 */
import { toast } from "vue-sonner";
import { approvalHeadline, closedOnCharge } from "#core/shared/money/approval-headline";

definePageMeta({
  middleware: ["nav-gate"],
  layout: "auth",
});

interface Person { userId: string; name: string; office?: string | null }
interface ApprovalItem {
  id: string;
  kind: "spend" | "void" | "waive" | "move";
  round: number;
  state: "pending" | "approved" | "rejected" | "cannot_approve" | "superseded";
  mode: "committee" | "majority";
  needed: number;
  approvals: number;
  rejections: number;
  remaining: number;
  progress: string;
  smallBoard: boolean;
  reason: string | null;
  date_created: string | null;
  decided_at: string | null;
  requested_by: Person | null;
  excluded: Person[];
  waiting_on: Person[];
  decisions: { id: string; decision: "approve" | "reject"; note: string | null; date_created: string | null; office: string | null; name: string }[];
  subject:
    | { type: "expense"; id: string; title: string; vendor: string | null; amount: number | null; status: string | null; paid_without_approval: boolean }
    | {
        type: "charge";
        id: string;
        title: string;
        amount: number | null;
        amount_remaining: number | null;
        status: string | null;
        household: string | null;
        waive_amount: number | null;
        late_fees: number;
        move: { from: string | null; to: string | null } | null;
      }
    | null;
  canDecide: boolean;
}

const { selectedOrgId } = await useSelectedOrg();
const { prompt } = useConfirm();

const view = ref<string>("open");
const { data, pending, refresh } = await useAsyncData(
  () => `money-approvals-${selectedOrgId.value}-${view.value}`,
  () =>
    selectedOrgId.value
      ? $fetch<{ approvals: ApprovalItem[]; awaitingMe: number }>("/api/org/money/approvals", { query: { orgId: selectedOrgId.value, view: view.value } })
      : Promise.resolve({ approvals: [] as ApprovalItem[], awaitingMe: 0 }),
  { watch: [selectedOrgId, view], server: false }
);
const items = computed(() => data.value?.approvals ?? []);
const views = computed(() => [
  { value: "open", label: "Waiting" },
  { value: "awaiting-me", label: "Needs me", count: data.value?.awaitingMe ?? 0 },
  { value: "all", label: "All" },
]);

const fdate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const nameOf = (p: Person) => (p.office ? `${p.name} (${p.office})` : p.name);
const andList = (names: string[]) => (names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

const headline = (a: ApprovalItem) => approvalHeadline(a.kind, a.subject);
const paidEarly = (a: ApprovalItem) => a.subject?.type === "expense" && a.subject.paid_without_approval;

const KIND_LABEL: Record<string, string> = { spend: "Spending", void: "Void", waive: "Waiver", move: "Move" };
const STATE_LABEL: Record<string, string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  cannot_approve: "Cannot be approved",
  superseded: "Replaced by a new round",
};
// A waiver or move closes without a new round: its charge was settled first.
const stateLabel = (a: ApprovalItem) => (closedOnCharge(a.kind, a.state) ? "Closed: the charge was settled" : STATE_LABEL[a.state]);
const STATE_CLASS: Record<string, string> = {
  pending: "bg-info/15 text-info",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cannot_approve: "bg-warning/15 text-warning",
  superseded: "t-bg-subtle t-text-muted",
};

/** What the rule needs, in words. */
const ruleLine = (a: ApprovalItem) =>
  a.mode === "committee"
    ? "Needs two of the President, Treasurer and Secretary."
    : a.smallBoard
      ? `The board is small, so it needs ${a.needed === 1 ? "one approval" : `${a.needed} approvals`} from members who didn't ask for it or change it.`
      : `Needs a majority of the board: ${a.needed} approval${a.needed === 1 ? "" : "s"}.`;

/** Who still has to act, or why nobody can. */
const stillNeeds = (a: ApprovalItem) => {
  if (a.state === "cannot_approve") {
    return "Not enough board members can decide this: the people who asked for it or changed it can't. It can still be recorded paid, and it will be flagged as paid before approval.";
  }
  if (a.state !== "pending") return null;
  const who = andList(a.waiting_on.map(nameOf));
  return `${a.remaining} more approval${a.remaining === 1 ? "" : "s"} needed${who ? ` from ${who}` : ""}.`;
};

const busy = ref<string | null>(null);
const decide = async (a: ApprovalItem, decision: "approve" | "reject") => {
  const note = await prompt({
    title: decision === "approve" ? "Approve this?" : "Reject this?",
    body: headline(a),
    label: "Note (optional)",
    multiline: true,
    maxLength: 1000,
    confirmLabel: decision === "approve" ? "Approve" : "Reject",
    destructive: decision === "reject",
  });
  if (note === null) return;
  busy.value = a.id;
  try {
    const res = await $fetch<{ state: string }>(`/api/org/money/approvals/${a.id}/decide`, {
      method: "POST",
      body: { orgId: selectedOrgId.value, decision, note: note || null },
    });
    toast.success(res.state === "approved" ? "Approved" : res.state === "rejected" ? "Rejected" : "Your decision is recorded");
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "That didn't work");
  } finally {
    busy.value = null;
    await refresh();
  }
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <AppPageHeader
        title="Approvals"
        description="Money going out needs two of the President, Treasurer and Secretary, or a majority of the board, and never the person who asked for it."
      />

      <AppSegmentedControl v-model="view" :items="views" label="Which approvals" />

      <div v-if="pending && !items.length" class="ios-card p-6 t-text-muted text-sm">Loading…</div>

      <AppEmptyState
        v-else-if="!items.length"
        icon="lucide:clipboard-check"
        :title="view === 'awaiting-me' ? 'Nothing needs you' : view === 'open' ? 'Nothing is waiting' : 'No approvals yet'"
        description="When someone submits an expense, asks to void one, or asks to waive or move a charge, it appears here."
      />

      <div v-else class="space-y-4">
        <article v-for="a in items" :key="a.id" class="ios-card p-5 space-y-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 space-y-1">
              <p class="text-xs uppercase tracking-wide t-text-muted">
                {{ KIND_LABEL[a.kind] }}<template v-if="a.round > 1"> · Round {{ a.round }}</template>
                <template v-if="a.date_created"> · {{ fdate(a.date_created) }}</template>
              </p>
              <h2 class="font-semibold t-text">{{ headline(a) }}</h2>
              <p v-if="a.requested_by" class="text-sm t-text-muted">Asked by {{ a.requested_by.name }}</p>
              <p v-if="a.reason" class="text-sm t-text">“{{ a.reason }}”</p>
            </div>
            <div class="flex flex-col items-end gap-1">
              <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" :class="STATE_CLASS[a.state]">{{ stateLabel(a) }}</span>
              <span v-if="paidEarly(a)" class="inline-flex items-center gap-1 bg-warning/15 text-warning rounded-full px-2 py-0.5 text-xs font-medium">
                <Icon name="lucide:alert-triangle" class="w-3 h-3" />Paid before approval
              </span>
            </div>
          </div>

          <div class="text-sm space-y-1">
            <p class="font-medium t-text">{{ a.progress }}</p>
            <p class="t-text-muted">{{ ruleLine(a) }}</p>
            <p v-if="stillNeeds(a)" class="t-text-muted">{{ stillNeeds(a) }}</p>
            <p v-if="a.excluded.length" class="t-text-muted">Can't decide this: {{ andList(a.excluded.map((p) => p.name)) }}.</p>
          </div>

          <ul v-if="a.decisions.length" class="text-sm space-y-1 border-t t-border pt-3">
            <li v-for="d in a.decisions" :key="d.id" class="flex flex-wrap items-start gap-x-2">
              <Icon :name="d.decision === 'approve' ? 'lucide:check' : 'lucide:x'" :class="d.decision === 'approve' ? 'text-success' : 'text-destructive'" class="w-4 h-4 mt-0.5" />
              <span class="t-text">{{ d.office ? `${d.name} (${d.office})` : d.name }} {{ d.decision === "approve" ? "approved" : "rejected" }}</span>
              <span v-if="d.date_created" class="t-text-muted">{{ fdate(d.date_created) }}</span>
              <span v-if="d.note" class="t-text-muted w-full pl-6">“{{ d.note }}”</span>
            </li>
          </ul>

          <div v-if="a.canDecide" class="flex justify-end gap-2 pt-1">
            <Button variant="outline" class="rounded-full" :disabled="busy === a.id" @click="decide(a, 'reject')">Reject</Button>
            <Button class="rounded-full" :disabled="busy === a.id" @click="decide(a, 'approve')">Approve</Button>
          </div>
        </article>
      </div>
    </PageContainer>
  </div>
</template>
