<!--
  DelegationHelperAreaSwitches — "Helps with": the areas a member (a helper) or
  a team (a committee) may work on (docs/spec-delegation.md).

  Admin only. It reads GET /api/org/area-grants for the holder and renders
  nothing when that refuses, so a role never sees a switch it cannot use. Each
  switch is one POST: on opens a dated row, off ends it, and both are recorded
  in the community's ledger. Below the switches, the last few changes with who
  made them, because a grant has a history ("end, don't erase").
-->
<script setup lang="ts">
import { toast } from "vue-sonner";
import { HELPER_AREA_KEYS, type HelperAreaKey } from "#core/shared/roles/area-grants";
import { HELPER_AREA_COPY } from "#core/shared/roles/helper-area-copy";

const props = defineProps<{ orgId: string; member?: string | null; team?: string | null }>();
const emit = defineEmits<{ changed: [areas: HelperAreaKey[]] }>();

interface HolderRead {
  holder: { kind: "member" | "team"; id: string; name: string };
  canHold: boolean;
  reason: string | null;
  open: HelperAreaKey[];
  rows: Array<{ id: string; area: HelperAreaKey; startsAt: string | null; endsAt: string | null; grantedBy: string | null; endedBy: string | null; open: boolean }>;
}

const query = computed(() => ({ orgId: props.orgId, ...(props.member ? { member: props.member } : { team: props.team }) }));
const { data, refresh } = await useAsyncData<HolderRead | null>(
  `helper-areas-${props.member ?? ""}-${props.team ?? ""}`,
  () => $fetch<HolderRead>("/api/org/area-grants", { query: query.value }).catch(() => null),
  { watch: [() => props.member, () => props.team], server: false },
);

const saving = ref<HelperAreaKey | null>(null);
const isOn = (k: HelperAreaKey) => !!data.value?.open.includes(k);

async function toggle(area: HelperAreaKey, value: boolean) {
  saving.value = area;
  try {
    const res = await $fetch<{ changed: boolean; areas: HelperAreaKey[]; recordError: string | null; summary: string | null }>(
      "/api/org/area-grants",
      { method: "POST", body: { ...query.value, area, value } },
    );
    if (res.recordError) toast.warning(`Saved, but not recorded in the ledger: ${res.recordError}`);
    else if (res.changed && res.summary) toast.success(res.summary);
    await refresh();
    emit("changed", res.areas);
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Could not change that.");
  } finally {
    saving.value = null;
  }
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
const recent = computed(() => (data.value?.rows ?? []).slice(0, 5));
const subject = computed(() => (data.value?.holder.kind === "team" ? "this committee's members" : "they"));
</script>

<template>
  <section v-if="data" class="grid gap-3 border-t t-border pt-4" data-helper-areas>
    <div class="grid gap-1">
      <h3 class="type-card">Helps with</h3>
      <p class="text-sm t-text-muted">
        What {{ subject }} can work on for the community. Each change is recorded in the community's ledger.
      </p>
    </div>

    <p v-if="!data.canHold" class="text-sm t-text-muted">{{ data.reason }}</p>

    <div v-else class="divide-y divide-[var(--theme-border-light)]">
      <div v-for="k in HELPER_AREA_KEYS" :key="k" class="flex items-center justify-between gap-3 py-2.5">
        <div class="grid gap-0.5 pr-4">
          <Label :for="`helper-area-${k}`" class="text-sm font-medium">{{ HELPER_AREA_COPY[k].label }}</Label>
          <p class="text-xs t-text-muted">{{ HELPER_AREA_COPY[k].desc }}</p>
        </div>
        <Switch
          :id="`helper-area-${k}`"
          :model-value="isOn(k)"
          :disabled="saving !== null"
          @update:model-value="(v: boolean) => toggle(k, v)"
        />
      </div>
    </div>

    <div v-if="recent.length" class="grid gap-1.5">
      <p class="type-meta t-text-muted">Recent changes</p>
      <ul class="grid gap-1">
        <li v-for="r in recent" :key="r.id" class="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span class="t-text">{{ HELPER_AREA_COPY[r.area]?.label ?? r.area }}</span>
          <span class="type-meta t-text-muted">
            {{ day(r.startsAt) }}<template v-if="r.grantedBy"> by {{ r.grantedBy }}</template>
            <template v-if="r.endsAt"> · ended {{ day(r.endsAt) }}<template v-if="r.endedBy"> by {{ r.endedBy }}</template></template>
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>
