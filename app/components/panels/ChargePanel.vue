<!--
  ChargePanel — one owner charge (?slide=charge:id, or the full page at
  /admin/payments/charges/:id). The detail moment of plan §2.3: a summary strip
  (status, amount due, the one next action top right), the facts, a timeline.

  Reads the row from the Charges resource (`reuse: true`), so over its index it
  makes no request, and a deep link loads through the same gated route
  (GET /api/org/money/charges, money:read). Actions are admin-only, as on the
  index: a board seat reading the books sees the same facts and no controls.
-->
<script setup lang="ts">
import type { FlipFromPayload } from "#core/app/composables/useFlipFromRow";

const props = defineProps<{
  id: string;
  mode?: string;
  flipFrom?: FlipFromPayload | null;
  /** The index path, when rendered as a full page. */
  page?: string | null;
}>();

defineEmits<{ (e: "close"): void }>();

const { selectedOrgId } = await useSelectedOrg();
const { isAdminOfCurrentDomain: canWrite } = useCurrentDomainAccess();
const { resource, markPaid, markingId } = useChargesResource(selectedOrgId, { reuse: true });

const charge = computed(() => resource.find(props.id));
const open = computed(() => !!charge.value && isOpenCharge(charge.value));

const fdate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const facts = computed(() => {
  const c = charge.value;
  if (!c) return [];
  return [
    { label: "Member", value: chargeMemberName(c.member) },
    { label: "Type", value: CHARGE_TYPE_LABEL[c.request_type as string] ?? "—" },
    { label: "Amount", value: chargeCurrency(c.amount) },
    { label: "Paid", value: chargeCurrency(c.amount_paid) },
    { label: "Remaining", value: chargeCurrency(c.amount_remaining ?? c.amount) },
    { label: "Due", value: fdate(c.due_date) },
  ];
});

// What happened to this charge, oldest first. The route carries the two dates
// it has; reminders and notices join this list when invoices do (Phase 5).
const timeline = computed(() => {
  const c = charge.value;
  if (!c) return [];
  return [
    { key: "created", icon: "lucide:file-plus", label: "Charge created", date: c.date_created },
    { key: "paid", icon: "lucide:check", label: "Paid", date: c.paid_at },
  ].filter((e) => !!e.date);
});
</script>

<template>
  <AppSlideOverShell
    :title="charge?.title || 'Charge'"
    :subtitle="charge ? chargeMemberName(charge.member) : null"
    :page="page"
    @close="$emit('close')"
  >
    <template v-if="canWrite && charge && open" #actions>
      <Button
        size="sm"
        class="rounded-full"
        :disabled="markingId === charge.id"
        @click="markPaid(charge)"
      >
        <Icon v-if="markingId === charge.id" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
        <Icon v-else name="lucide:check" class="w-4 h-4 mr-1.5" />
        Mark Paid
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <Icon name="lucide:more-horizontal" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem class="text-destructive" @click="resource.remove(charge)">
            <Icon name="lucide:x" class="w-4 h-4 mr-2" />
            {{ resource.removeLabel }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </template>

    <div v-if="!charge && resource.pending" class="py-16 flex justify-center">
      <div class="spinner-ios" />
    </div>

    <AppEmptyState
      v-else-if="!charge"
      title="Charge not found"
      description="It may have been removed, or belong to another community."
      icon="lucide:receipt"
      size="sm"
    />

    <div v-else class="space-y-6">
      <!-- Summary strip: where it stands, and how much is still owed. -->
      <div class="charge-panel__summary">
        <span
          class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize"
          :class="CHARGE_STATUS_CLASS[charge.status as string]"
        >
          {{ charge.status }}
        </span>
        <div class="text-right">
          <p class="type-meta t-text-muted">{{ open ? "Amount due" : "Amount" }}</p>
          <p class="text-2xl font-semibold tabular-nums t-text">
            {{ chargeCurrency(open ? (charge.amount_remaining ?? charge.amount) : charge.amount) }}
          </p>
        </div>
      </div>

      <section class="space-y-2">
        <h3 class="type-card">Details</h3>
        <dl class="charge-panel__facts">
          <div v-for="f in facts" :key="f.label" class="charge-panel__fact">
            <dt class="type-meta t-text-muted">{{ f.label }}</dt>
            <dd class="t-text tabular-nums">{{ f.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="space-y-2">
        <h3 class="type-card">Timeline</h3>
        <ol class="charge-panel__timeline">
          <li v-for="e in timeline" :key="e.key" class="charge-panel__event">
            <span class="charge-panel__dot" aria-hidden="true">
              <Icon :name="e.icon" class="w-3.5 h-3.5" />
            </span>
            <span class="t-text">{{ e.label }}</span>
            <span class="type-meta t-text-muted ml-auto">{{ fdate(e.date) }}</span>
          </li>
        </ol>
      </section>
    </div>
  </AppSlideOverShell>
</template>

<style scoped>
.charge-panel__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 70%, transparent);
}
.charge-panel__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1.5rem;
}
.charge-panel__fact {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.charge-panel__timeline {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.charge-panel__event {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.charge-panel__dot {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 85%, transparent);
  color: var(--theme-text-secondary);
}
</style>
