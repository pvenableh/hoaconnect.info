<script setup lang="ts">
// Governing documents: the organization overview (spec §6). Counts by
// relationship, the counsel_review flags as an open-questions list, and, for
// people who manage governing documents, the flags waiting for a decision and
// the statute references that should be read again.
import {
  FLAG_NOTICE,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_ORDER,
  STALE_REASON_LABELS,
} from "#core/shared/governing/flags";
import { formatRecordDate } from "#core/shared/governing/labels";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { getOverview } = useGoverningDocs(selectedOrgId);
const { isPreviewingMember } = useViewAs();

const { data, pending, error, refresh } = await useAsyncData(
  "governing-overview",
  async () => (selectedOrgId.value ? await getOverview() : null),
  { watch: [selectedOrgId], server: false }
);

const manages = computed(() => !!data.value?.can_manage && !isPreviewingMember.value);
const searchPath = (relationship: string) => ({ path: buildOrgPath("/governing/search"), query: { relationship } });
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <AppPageHeader
        eyebrow="Governing documents"
        title="State law overview"
        description="Where state law and your recorded documents meet, point by point."
        :back-to="buildOrgPath('/governing')"
        back-label="Governing documents"
      />

      <AppEmptyState
        v-if="error"
        icon="lucide:triangle-alert"
        title="The overview could not be loaded"
        description="Reload the page to try again."
      />

      <!-- No answer yet (still loading, or the org is not resolved): never "empty". -->
      <div v-else-if="!data" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

      <AppEmptyState
        v-else-if="!data.flag_count && !data.dismissed.length"
        icon="lucide:scale"
        title="No comparisons with state law yet"
        description="They appear here once the board confirms them."
      />

      <template v-else>
        <p class="ios-card px-4 py-3 type-meta t-text-secondary" data-testid="governing-flag-notice">{{ FLAG_NOTICE }}</p>

        <section class="space-y-2">
          <h2 class="type-section t-text">By relationship</h2>
          <ul class="ios-card divide-y t-border" data-testid="governing-relationship-counts">
            <li v-for="r in RELATIONSHIP_ORDER" :key="r">
              <NuxtLink :to="searchPath(r)" class="px-4 py-3 flex items-center gap-3">
                <span class="flex-1 min-w-0" :class="r === 'counsel_review' ? 'type-card t-text' : 'type-body t-text'">
                  {{ RELATIONSHIP_LABELS[r] }}
                </span>
                <span class="type-body t-text-secondary tabular-nums">{{ data.by_relationship[r] }}</span>
                <Icon name="lucide:chevron-right" class="w-4 h-4 t-text-muted shrink-0" />
              </NuxtLink>
            </li>
          </ul>
          <p class="type-meta t-text-muted">
            {{ data.flag_count }} {{ data.flag_count === 1 ? "comparison" : "comparisons" }} across {{ data.provision_count }}
            {{ data.provision_count === 1 ? "provision" : "provisions" }} in {{ data.document_count }}
            {{ data.document_count === 1 ? "document" : "documents" }}.
          </p>
        </section>

        <section class="space-y-2" data-testid="governing-open-questions">
          <h2 class="type-section t-text">Open questions for counsel</h2>
          <div v-if="data.open_questions.length" class="space-y-3">
            <GoverningStatuteFlag
              v-for="flag in data.open_questions"
              :key="flag.id"
              :flag="flag"
              :provisions="flag.provisions"
              :org-id="selectedOrgId"
              :can-manage="data.can_manage"
              @changed="refresh()"
            />
          </div>
          <AppEmptyState
            v-else
            icon="lucide:scale"
            title="No open questions"
            description="Nothing is waiting for association counsel."
            size="sm"
          />
        </section>

        <template v-if="manages">
          <section v-if="data.suggested.length" class="space-y-2">
            <h2 class="type-section t-text">Waiting for a decision</h2>
            <p class="type-meta t-text-muted">Members do not see these until someone confirms them.</p>
            <div class="space-y-3">
              <GoverningStatuteFlag
                v-for="flag in data.suggested"
                :key="flag.id"
                :flag="flag"
                :provisions="flag.provisions"
                :org-id="selectedOrgId"
                can-manage
                @changed="refresh()"
              />
            </div>
          </section>

          <section class="space-y-2" data-testid="governing-stale-references">
            <h2 class="type-section t-text">Statute references to read again</h2>
            <p class="type-meta t-text-muted">
              References with no checked date, marked for recheck, or last checked more than {{ data.stale_after_days }} days ago.
            </p>
            <ul v-if="data.stale_references.length" class="ios-card divide-y t-border">
              <li v-for="entry in data.stale_references" :key="entry.reference.id" class="px-4 py-3 space-y-1">
                <p class="type-body t-text">
                  <a
                    v-if="entry.reference.url"
                    :href="entry.reference.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="t-text-accent underline"
                  >
                    {{ entry.reference.code }}
                  </a>
                  <span v-else>{{ entry.reference.code }}</span>
                </p>
                <p class="type-meta t-text-muted flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{{ STALE_REASON_LABELS[entry.reason] }}</span>
                  <span v-if="entry.reference.edition">Edition: {{ entry.reference.edition }}</span>
                  <span v-if="entry.reference.checked_on">Checked {{ formatRecordDate(entry.reference.checked_on) }}</span>
                  <span>Cited by {{ entry.flag_count }} {{ entry.flag_count === 1 ? "flag" : "flags" }}</span>
                </p>
              </li>
            </ul>
            <AppEmptyState
              v-else
              icon="lucide:circle-check"
              title="Every reference is current"
              description="Nothing cited here is overdue for a re-read."
              size="sm"
            />
          </section>

          <section v-if="data.dismissed.length" class="space-y-2">
            <h2 class="type-section t-text">Dismissed</h2>
            <div class="space-y-3">
              <GoverningStatuteFlag
                v-for="flag in data.dismissed"
                :key="flag.id"
                :flag="flag"
                :provisions="flag.provisions"
                :org-id="selectedOrgId"
                can-manage
                @changed="refresh()"
              />
            </div>
          </section>
        </template>
      </template>
    </PageContainer>
  </div>
</template>
