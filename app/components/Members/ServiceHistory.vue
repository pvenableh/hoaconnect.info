<!--
  MembersServiceHistory — a member's service to the community (plan §3.4,
  "Service history"): every office they have held and every job they have held,
  with dates. Read from GET /api/org/responsibilities/service-history, which
  answers editors and board seats and refuses everyone else; on a refusal this
  shows nothing, so a role never sees a section it cannot read.

  A job reaches a member two ways: a row that names them, or a row that names an
  office while they held it. The second is clipped to their term, so "Treasurer
  from January to December" shows as the months they were treasurer.
-->
<script setup lang="ts">
import { endReasonLabel } from "#core/shared/responsibilities/config";
import type { ServiceHistory } from "#core/shared/responsibilities/history";

const props = defineProps<{ orgId: string; memberId: string }>();

const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();

const { data: history } = await useAsyncData<ServiceHistory | null>(
  `service-history-${props.memberId}`,
  () =>
    $fetch<ServiceHistory>("/api/org/responsibilities/service-history", {
      query: { orgId: props.orgId, member: props.memberId },
    }).catch(() => null),
  { watch: [() => props.memberId], server: false },
);

const span = (r: { from: string | null; to: string | null }) =>
  `${r.from ? registerDay(r.from) : "…"} – ${r.to ? registerDay(r.to) : "present"}`;
const jobsOn = computed(() => isEnabled("responsibilities"));
const empty = computed(() => !history.value?.offices.length && !(jobsOn.value && history.value?.jobs.length));
</script>

<template>
  <section v-if="history" class="grid gap-3 border-t t-border pt-4" data-member-service-history>
    <h3 class="type-card">Service history</h3>

    <!-- allow-bare-empty: a field value in the member sheet, not an empty collection -->
    <p v-if="empty" class="text-sm t-text-muted">Has not held a board office or a job in the register.</p>

    <div v-if="history.offices.length" class="grid gap-1.5">
      <p class="type-meta t-text-muted">Offices held</p>
      <ul class="grid gap-1.5">
        <li v-for="o in history.offices" :key="o.termId" class="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span class="t-text">
            {{ o.label }}
            <span v-if="o.status && o.status !== 'published'" class="t-text-muted">· {{ o.status }}</span>
          </span>
          <span class="type-meta t-text-muted">
            {{ span(o) }}<template v-if="o.endReason"> · {{ endReasonLabel(o.endReason) }}</template>
          </span>
        </li>
      </ul>
    </div>

    <div v-if="jobsOn && history.jobs.length" class="grid gap-1.5">
      <p class="type-meta t-text-muted">Jobs held</p>
      <ul class="grid gap-1.5">
        <li v-for="(j, i) in history.jobs" :key="`${j.jobId}:${i}`" class="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span class="t-text">
            <NuxtLink :to="buildOrgPath(`/admin/responsibilities/${j.jobId}`)" class="underline">{{ j.title }}</NuxtLink>
            <span class="t-text-muted">
              · {{ j.roleLabel.toLowerCase() }}<template v-if="j.via === 'office' && j.office"> as {{ j.office.replace(/_/g, " ") }}</template>
            </span>
          </span>
          <span class="type-meta t-text-muted">{{ span(j) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
