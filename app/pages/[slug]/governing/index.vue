<script setup lang="ts">
// Governing documents: the list. The recorded declaration, by-laws and
// amendments as structured, verbatim provisions (docs/plan-governing-docs.md).
// The Rules page (hoa_governance) is a different thing and is untouched.
import { formatBookAndPage, formatRecordDate, kindLabel, statusLabel } from "#core/shared/governing/labels";
import { MIN_QUERY } from "#core/shared/governing/search";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { listDocuments } = useGoverningDocs(selectedOrgId);

const { data, pending, error } = await useAsyncData(
  "governing-documents",
  async () => (selectedOrgId.value ? await listDocuments() : null),
  { watch: [selectedOrgId], server: false }
);

const documents = computed(() => data.value?.documents ?? []);
const provisionTotal = computed(() => documents.value.reduce((sum, d) => sum + d.provision_count, 0));

const query = ref("");
const runSearch = async () => {
  const q = query.value.trim();
  if (q.length < MIN_QUERY) return;
  await navigateTo({ path: buildOrgPath("/governing/search"), query: { q } });
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <AppPageHeader
        eyebrow="Records"
        title="Governing documents"
        description="The recorded declaration, by-laws and amendments, word for word."
      />

      <form class="flex items-center gap-2" role="search" @submit.prevent="runSearch">
        <Input
          v-model="query"
          type="search"
          class="glass-field flex-1"
          placeholder="Search by citation or words, for example By-Law 3.5 or proxies"
          aria-label="Search governing documents"
        />
        <Button type="submit" variant="outline">Search</Button>
      </form>

      <AppEmptyState
        v-if="error"
        icon="lucide:triangle-alert"
        title="The governing documents could not be loaded"
        description="Reload the page to try again."
      />

      <!-- No answer yet (still loading, or the org is not resolved): never "empty". -->
      <div v-else-if="pending || !data" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

      <AppEmptyState
        v-else-if="!documents.length"
        icon="lucide:scroll-text"
        title="No governing documents yet"
        description="The declaration, by-laws and amendments appear here once the board publishes them."
      />

      <template v-else>
        <p class="type-meta t-text-muted">
          {{ documents.length }} {{ documents.length === 1 ? "document" : "documents" }},
          {{ provisionTotal }} {{ provisionTotal === 1 ? "provision" : "provisions" }}
        </p>

        <ul class="space-y-2">
          <li v-for="doc in documents" :key="doc.id">
            <NuxtLink :to="buildOrgPath(`/governing/${doc.id}`)" class="ios-card block px-4 py-3">
              <div class="flex items-start gap-3">
                <div class="flex-1 min-w-0">
                  <p class="type-micro t-text-muted">{{ kindLabel(doc.kind) }}</p>
                  <h2 class="type-card t-text mt-0.5">{{ doc.title }}</h2>
                  <p class="type-meta t-text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span v-if="doc.recorded_on">Recorded {{ formatRecordDate(doc.recorded_on) }}</span>
                    <span v-if="formatBookAndPage(doc.or_book, doc.or_page_start, doc.or_page_end)">
                      {{ formatBookAndPage(doc.or_book, doc.or_page_start, doc.or_page_end) }}
                    </span>
                    <span>{{ doc.provision_count }} {{ doc.provision_count === 1 ? "provision" : "provisions" }}</span>
                  </p>
                </div>
                <Badge v-if="doc.status !== 'published'" variant="secondary">{{ statusLabel(doc.status) }}</Badge>
                <Icon name="lucide:chevron-right" class="w-4 h-4 t-text-muted shrink-0 mt-1" />
              </div>
            </NuxtLink>
          </li>
        </ul>
      </template>
    </PageContainer>
  </div>
</template>
