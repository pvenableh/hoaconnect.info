<!--
  ChargeCorrectionSheet — one sheet for the three corrections that need a form
  (docs/spec-charge-corrections.md), opened from a charge's row or its panel:

    edit    an admin: title, description, notes, the amount (up only) and the
            due date (only while it may change: `due_date_lock` says why not)
    waive   money:enter: all that's owed (with its late fees) or part of it,
            and why. The board approves it
    move    money:enter: the household it belongs to, and why. The board
            approves it

  Withdraw needs only a reason, so it is a prompt in useChargesResource.
  The server decides; this form only keeps from sending what it would refuse.
-->
<script setup lang="ts">
import type { HoaMember } from "#core/types/directus";
import type { ChargeRow } from "#core/app/composables/useMoneyReads";
import type { ChargeSheetMode } from "#core/app/composables/useChargesResource";

const props = defineProps<{
  open: boolean;
  mode: ChargeSheetMode;
  charge: ChargeRow | null;
  orgId: string | null | undefined;
}>();
const emit = defineEmits<{ (e: "update:open", v: boolean): void }>();

const orgRef = computed(() => props.orgId);
const { askWaive, askMove, saveCorrection, waivingId } = useChargesResource(orgRef, { reuse: true });

const TITLES: Record<ChargeSheetMode, string> = { edit: "Edit charge", waive: "Ask to waive", move: "Move to another household" };
const owed = computed(() => Number(props.charge?.amount_remaining ?? props.charge?.amount ?? 0));
const lateFees = computed(() => Number(props.charge?.late_fees_open ?? 0));
const today = () => new Date().toISOString().slice(0, 10);

const form = ref({
  title: "",
  description: "",
  notes: "",
  amount: null as number | null,
  due_date: "" as string | null,
  waive: "all" as "all" | "part",
  waiveAmount: null as number | null,
  member: "",
  reason: "",
});

watch(
  () => [props.open, props.charge?.id, props.mode] as const,
  async ([open]) => {
    if (!open || !props.charge) return;
    const c = props.charge;
    form.value = {
      title: c.title ?? "",
      description: c.description ?? "",
      notes: c.notes ?? "",
      amount: c.amount == null ? null : Number(c.amount),
      due_date: c.due_date ? String(c.due_date).slice(0, 10) : "",
      waive: "all",
      waiveAmount: null,
      member: "",
      reason: "",
    };
    if (props.mode === "move") await loadMembers();
  },
  { immediate: true }
);

// The households a charge can move to: the community's active members, not its own.
const { list: listMembers } = useDirectusItems<HoaMember>("hoa_members");
const members = ref<HoaMember[]>([]);
async function loadMembers() {
  if (!props.orgId) return;
  const rows = await listMembers({
    fields: ["id", "first_name", "last_name", "email"],
    filter: { organization: { _eq: props.orgId }, status: { _eq: "active" } },
    sort: ["first_name", "last_name"],
    limit: 500,
  }).catch(() => []);
  const own = props.charge?.member && typeof props.charge.member === "object" ? (props.charge.member as { id?: string }).id : props.charge?.member;
  members.value = ((rows || []) as HoaMember[]).filter((m) => m.id !== own);
}

const currentAmount = computed(() => Number(props.charge?.amount ?? 0));
const amountTooLow = computed(() => form.value.amount != null && form.value.amount < currentAmount.value);
const busy = computed(() => !!props.charge && waivingId.value === props.charge.id);

const canSend = computed(() => {
  const f = form.value;
  if (!props.charge) return false;
  if (props.mode === "edit") return !!f.title.trim() && (f.amount ?? 0) > 0 && !amountTooLow.value;
  if (!f.reason.trim()) return false;
  if (props.mode === "move") return !!f.member;
  return f.waive === "all" || ((f.waiveAmount ?? 0) > 0 && (f.waiveAmount ?? 0) < owed.value);
});

async function send() {
  const c = props.charge;
  if (!c || !canSend.value) return;
  const f = form.value;
  let ok = false;
  if (props.mode === "edit") {
    const body: Parameters<typeof saveCorrection>[1] = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      notes: f.notes.trim() || null,
    };
    if (f.amount != null && f.amount !== currentAmount.value) body.amount = f.amount;
    if (!c.due_date_lock && f.due_date && f.due_date !== (c.due_date ? String(c.due_date).slice(0, 10) : "")) body.due_date = f.due_date;
    ok = await saveCorrection(c, body);
  } else if (props.mode === "waive") {
    ok = await askWaive(c, { reason: f.reason, amount: f.waive === "all" ? null : f.waiveAmount });
  } else {
    ok = await askMove(c, { member: f.member, reason: f.reason });
  }
  if (ok) emit("update:open", false);
}

const memberName = (m: HoaMember) => [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "—";
</script>

<template>
  <AppBottomSheet :open="open" :title="TITLES[mode]" size="md" @update:open="emit('update:open', $event)">
    <div v-if="charge" class="space-y-4">
      <p class="text-sm t-text-muted">
        {{ charge.title }} · {{ chargeMemberName(charge.member) }} · {{ chargeCurrency(owed) }} owed
      </p>

      <template v-if="mode === 'edit'">
        <div class="space-y-1.5">
          <Label for="charge-title">Title</Label>
          <AppInput id="charge-title" v-model="form.title" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <Label for="charge-amount">Amount</Label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 t-text-muted">$</span>
              <AppInput id="charge-amount" v-model.number="form.amount" type="number" :min="currentAmount" step="0.01" class="pl-7" />
            </div>
            <p class="type-meta" :class="amountTooLow ? 'text-destructive' : 't-text-muted'">
              To lower it, Ask to Waive part of it.
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="charge-due">Due date</Label>
            <DateInput id="charge-due" v-model="form.due_date" :min="today()" :disabled="!!charge.due_date_lock" />
            <p v-if="charge.due_date_lock" class="type-meta t-text-muted">{{ charge.due_date_lock }}</p>
          </div>
        </div>
        <div class="space-y-1.5">
          <Label for="charge-description">Description</Label>
          <AppInput id="charge-description" v-model="form.description" placeholder="A note the member sees" />
        </div>
        <div class="space-y-1.5">
          <Label for="charge-notes">Notes</Label>
          <AppTextarea id="charge-notes" v-model="form.notes" rows="3" placeholder="For the board" />
        </div>
      </template>

      <template v-else-if="mode === 'waive'">
        <RadioGroup v-model="form.waive" class="space-y-2">
          <label class="flex items-start gap-3">
            <RadioGroupItem value="all" class="mt-0.5" />
            <span class="t-text">
              All that's owed: {{ chargeCurrency(owed) }}
              <span v-if="lateFees > 0" class="t-text-muted"> plus its late fees ({{ chargeCurrency(lateFees) }})</span>
            </span>
          </label>
          <label class="flex items-start gap-3">
            <RadioGroupItem value="part" class="mt-0.5" />
            <span class="t-text">Part of it</span>
          </label>
        </RadioGroup>
        <div v-if="form.waive === 'part'" class="space-y-1.5">
          <Label for="waive-amount">Amount to waive</Label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 t-text-muted">$</span>
            <AppInput id="waive-amount" v-model.number="form.waiveAmount" type="number" min="0.01" :max="owed" step="0.01" class="pl-7" />
          </div>
          <p class="type-meta t-text-muted">Less than {{ chargeCurrency(owed) }}. Its late fees stay owed.</p>
        </div>
      </template>

      <template v-else>
        <div class="space-y-1.5">
          <Label for="move-member">The household it belongs to</Label>
          <Select v-model="form.member">
            <AppSelectTrigger id="move-member" class="w-full">
              <SelectValue placeholder="Choose a household…" />
            </AppSelectTrigger>
            <AppSelectContent>
              <SelectItem v-for="m in members" :key="m.id" :value="m.id">{{ memberName(m) }}</SelectItem>
            </AppSelectContent>
          </Select>
          <p v-if="(charge.late_fees_open ?? 0) > 0" class="type-meta t-text-muted">
            Its late fees ({{ chargeCurrency(charge.late_fees_open) }}) are canceled when it moves.
          </p>
        </div>
      </template>

      <div v-if="mode !== 'edit'" class="space-y-1.5">
        <Label for="charge-reason">Why</Label>
        <AppTextarea id="charge-reason" v-model="form.reason" rows="3" maxlength="1000" />
        <p class="type-meta t-text-muted">
          This gives up income the community is owed, so the board approves it like spending. You can't approve your own request.
        </p>
      </div>

      <div class="flex justify-end gap-2">
        <AppButton variant="outline" class="rounded-full" @click="emit('update:open', false)">Cancel</AppButton>
        <AppButton class="rounded-full" :disabled="!canSend || busy" @click="send">
          <Icon v-if="busy" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
          {{ mode === "edit" ? "Save" : mode === "waive" ? "Ask to Waive" : "Ask to Move" }}
        </AppButton>
      </div>
    </div>
  </AppBottomSheet>
</template>
