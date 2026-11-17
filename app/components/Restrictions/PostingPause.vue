<!--
  RestrictionsPostingPause — "Posting" on a member's sheet: pause their posting
  in this community, lift a pause, and the history (docs/spec-member-
  restrictions.md).

  Admin only. It reads GET /api/org/member-restrictions for the member and
  renders nothing when that refuses, so a role never sees a control it cannot
  use. For an admin, a manager, an inactive member or a board seat it shows
  the reason instead of the control.
-->
<script setup lang="ts">
import { toast } from "vue-sonner";

const props = defineProps<{ orgId: string; member: string }>();
const emit = defineEmits<{ changed: [] }>();

interface Row {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  until: string;
  liftedAt: string | null;
  memberNote: string;
  internalNote: string | null;
  imposedBy: string | null;
  liftedBy: string | null;
  inForce: boolean;
}
interface Read {
  member: { id: string; name: string; status: string | null };
  canRestrict: boolean;
  reason: string | null;
  open: string | null;
  rows: Row[];
}

const { data, refresh } = await useAsyncData<Read | null>(
  `member-restrictions-${props.member}`,
  () => $fetch<Read>("/api/org/member-restrictions", { query: { orgId: props.orgId, member: props.member } }).catch(() => null),
  { watch: [() => props.member], server: false },
);

const { confirm } = useConfirm();
const formOpen = ref(false);
const lifting = ref(false);
const open = computed(() => data.value?.rows.find((r) => r.id === data.value?.open) ?? null);
const past = computed(() => (data.value?.rows ?? []).filter((r) => r.id !== data.value?.open).slice(0, 5));
const name = computed(() => data.value?.member.name || "this member");

function reportResult(res: { recordError?: string | null; notified?: boolean; scopeSynced?: boolean }, done: string) {
  if (res.recordError) toast.warning(`${done}, but not recorded in the ledger: ${res.recordError}`);
  else if (res.scopeSynced === false) toast.warning(`${done}. It may take until tonight to reach chat.`);
  else toast.success(done);
}

async function pause(body: { endsOn: string | null; memberNote: string; internalNote: string | null }): Promise<boolean> {
  try {
    const res = await $fetch<any>("/api/org/member-restrictions", { method: "POST", body: { orgId: props.orgId, member: props.member, ...body } });
    reportResult(res, `${name.value}'s posting is paused ${res.restriction?.until ?? ""}`.trim());
    formOpen.value = false;
    await refresh();
    emit("changed");
    return true;
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Could not pause their posting.");
    return false;
  }
}

async function lift() {
  const row = open.value;
  if (!row || lifting.value) return;
  const ok = await confirm({
    title: `Lift the pause on ${name.value}'s posting?`,
    body: "They can post again at once, and they are told. The pause stays in the history.",
    confirmLabel: "Lift pause",
  });
  if (!ok) return;
  lifting.value = true;
  try {
    const res = await $fetch<any>(`/api/org/member-restrictions/${row.id}/lift`, { method: "POST", body: { orgId: props.orgId } });
    reportResult(res, `${name.value} can post again`);
    await refresh();
    emit("changed");
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Could not lift the pause.");
  } finally {
    lifting.value = false;
  }
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
</script>

<template>
  <section v-if="data" class="grid gap-3 border-t t-border pt-4" data-posting-pause>
    <div class="grid gap-1">
      <h3 class="type-card">Posting</h3>
      <p class="text-sm t-text-muted">
        Pausing stops what reaches other people: chat, comments, reactions and reports. Each change is recorded for the board.
      </p>
    </div>

    <div v-if="open" class="grid gap-2">
      <p class="text-sm t-text font-medium">Posting paused {{ open.until }}</p>
      <p class="text-sm t-text-secondary">{{ open.memberNote }}</p>
      <p v-if="open.internalNote" class="text-sm t-text-muted">Admins' note: {{ open.internalNote }}</p>
      <p class="type-meta t-text-muted">Since {{ day(open.startsAt) }}<template v-if="open.imposedBy"> by {{ open.imposedBy }}</template></p>
      <div>
        <Button variant="outline" size="sm" :disabled="lifting" @click="lift">Lift pause</Button>
      </div>
    </div>
    <p v-else-if="!data.canRestrict" class="text-sm t-text-muted">{{ data.reason }}</p>
    <RestrictionsPauseForm v-else-if="formOpen" :name="name" :save="pause" @cancel="formOpen = false" />
    <div v-else>
      <Button variant="outline" size="sm" @click="formOpen = true">Pause posting</Button>
    </div>

    <div v-if="past.length" class="grid gap-1.5">
      <p class="type-meta t-text-muted">Earlier pauses</p>
      <ul class="grid gap-1">
        <li v-for="r in past" :key="r.id" class="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span class="t-text">{{ day(r.startsAt) }}<template v-if="r.imposedBy"> by {{ r.imposedBy }}</template></span>
          <span class="type-meta t-text-muted">
            <template v-if="r.liftedAt">lifted {{ day(r.liftedAt) }}<template v-if="r.liftedBy"> by {{ r.liftedBy }}</template></template>
            <template v-else>ended {{ day(r.endsAt) }}</template>
          </span>
        </li>
      </ul>
    </div>

  </section>
</template>
