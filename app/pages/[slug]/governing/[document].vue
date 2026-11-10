<script setup lang="ts">
// Governing documents: one document as a continuous reading view, with a table
// of contents, recorded-page markers and the transcriber's notes (spec §6).
// Provision text is shown exactly as stored: plain text, line breaks kept.
import { formatBookAndPage, formatRecordDate, kindLabel, provisionDepths, statusLabel } from "#core/shared/governing/labels";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { getDocument } = useGoverningDocs(selectedOrgId);

const documentId = computed(() => String(route.params.document ?? ""));

const { data, pending } = await useAsyncData(
  () => `governing-document-${documentId.value}`,
  async () => {
    if (!selectedOrgId.value || !documentId.value) return null;
    try {
      return await getDocument(documentId.value);
    } catch {
      // A document the caller may not see is a 404; the page says "not found".
      return null;
    }
  },
  { watch: [documentId, selectedOrgId], server: false }
);

const doc = computed(() => data.value?.document ?? null);
const provisions = computed(() => data.value?.provisions ?? []);
const depths = computed(() => provisionDepths(provisions.value));

// A marker goes above the first provision and above each one that starts on a
// later recorded page than the one before it.
const startsPage = computed(() => {
  const marks = new Set<string>();
  let last: number | null = null;
  for (const p of provisions.value) {
    if (p.or_page_start != null && p.or_page_start !== last) {
      marks.add(p.id);
      last = p.or_page_start;
    }
  }
  return marks;
});

const facts = computed(() => {
  const d = doc.value;
  if (!d) return [];
  return [
    { label: "Recorded", value: formatRecordDate(d.recorded_on) },
    { label: "Executed", value: formatRecordDate(d.executed_on) },
    { label: "Official records", value: formatBookAndPage(d.or_book, d.or_page_start, d.or_page_end) },
    { label: "Clerk's file no.", value: d.clerk_file_no ?? "" },
    { label: "County", value: d.county ?? "" },
  ].filter((f) => f.value);
});

// Arriving with #p-<id> (from a provision page or a search result): the
// provisions render after the fetch, so the browser's own jump has no target yet.
const scrollToHash = async () => {
  if (!route.hash) return;
  await nextTick();
  document.getElementById(route.hash.slice(1))?.scrollIntoView({ block: "start" });
};
watch(() => [provisions.value.length, route.hash], scrollToHash, { flush: "post" });
onMounted(scrollToHash);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div v-if="pending" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <template v-else-if="!doc">
        <BackLink :to="buildOrgPath('/governing')" label="Governing documents" />
        <AppEmptyState
          icon="lucide:scroll-text"
          title="Document not found"
          description="It may have been removed, or it is not published yet."
        />
      </template>

      <template v-else>
        <AppPageHeader
          :eyebrow="kindLabel(doc.kind)"
          :title="doc.title ?? 'Untitled document'"
          :back-to="buildOrgPath('/governing')"
          back-label="Governing documents"
        />

        <div class="ios-card p-4 space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <Badge v-if="doc.status !== 'published'" variant="secondary">{{ statusLabel(doc.status) }}</Badge>
            <span class="type-meta t-text-muted">
              {{ provisions.length }} {{ provisions.length === 1 ? "provision" : "provisions" }}
            </span>
          </div>
          <dl v-if="facts.length" class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <div v-for="fact in facts" :key="fact.label">
              <dt class="type-micro t-text-muted">{{ fact.label }}</dt>
              <dd class="type-body t-text">{{ fact.value }}</dd>
            </div>
          </dl>
          <p v-if="data?.amends" class="type-body t-text-secondary">
            Amends
            <NuxtLink :to="buildOrgPath(`/governing/${data.amends.id}`)" class="t-text-accent underline">{{ data.amends.title }}</NuxtLink>
          </p>
          <div v-if="data?.amended_by.length" class="type-body t-text-secondary">
            Amended by
            <ul class="mt-1 space-y-0.5">
              <li v-for="other in data.amended_by" :key="other.id">
                <NuxtLink :to="buildOrgPath(`/governing/${other.id}`)" class="t-text-accent underline">{{ other.title }}</NuxtLink>
                <span v-if="other.recorded_on" class="t-text-muted">, recorded {{ formatRecordDate(other.recorded_on) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <AppEmptyState
          v-if="!provisions.length"
          icon="lucide:scroll-text"
          title="No provisions in this document yet"
          description="Its text appears here once it has been reviewed."
          size="sm"
        />

        <div v-else class="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8 space-y-6 lg:space-y-0">
          <nav aria-label="Table of contents" class="lg:sticky lg:top-24 lg:self-start">
            <p class="type-micro t-text-muted mb-2">Contents</p>
            <ol class="governing-toc space-y-1 max-h-64 lg:max-h-[70vh] overflow-y-auto pr-2">
              <li v-for="p in provisions" :key="p.id" :style="{ paddingLeft: `${(depths.get(p.id) ?? 0) * 0.75}rem` }">
                <a :href="`#p-${p.id}`" class="type-meta t-text-secondary hover:t-text block">
                  <span class="t-text">{{ p.citation }}</span>
                  <span v-if="p.heading"> · {{ p.heading }}</span>
                </a>
              </li>
            </ol>
          </nav>

          <div class="min-w-0 space-y-6">
            <article class="space-y-6">
              <section v-for="p in provisions" :id="`p-${p.id}`" :key="p.id" class="scroll-mt-24 space-y-2">
                <p v-if="startsPage.has(p.id)" class="type-micro t-text-muted border-t t-border pt-2">
                  {{ formatBookAndPage(doc.or_book, p.or_page_start, p.or_page_start) }}
                </p>
                <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 class="type-card t-text">
                    <NuxtLink :to="buildOrgPath(`/governing/provisions/${p.id}`)" class="hover:underline">
                      {{ p.citation }}<template v-if="p.heading"> · {{ p.heading }}</template>
                    </NuxtLink>
                  </h2>
                  <Badge v-if="p.review_state === 'ocr_draft'" variant="secondary">Not yet reviewed</Badge>
                  <Badge v-if="p.uncertain" variant="secondary">Uncertain reading</Badge>
                </div>
                <p class="governing-text type-body t-text-secondary">{{ p.text }}</p>
              </section>
            </article>

            <section v-if="doc.transcriber_notes" class="border-t t-border pt-4 space-y-2">
              <h2 class="type-card t-text">Transcriber's notes</h2>
              <p class="governing-text type-meta t-text-muted">{{ doc.transcriber_notes }}</p>
            </section>
          </div>
        </div>
      </template>
    </PageContainer>
  </div>
</template>

<style scoped>
/* The words are the record: keep every line break and space as stored. */
.governing-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
