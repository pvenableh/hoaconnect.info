<script setup lang="ts">
// Governing documents: one provision. Verbatim text, citation, recorded book
// and page, source document, amendment chain and copy-citation (spec §6).
// Statute flags (spec §5) sit under the text, "Ask counsel." first, always
// with the not-legal-advice notice.
import { toast } from "vue-sonner";
import { FLAG_NOTICE } from "#core/shared/governing/flags";
import { formatBookAndPage, formatRecordDate, kindLabel, linkLabel } from "#core/shared/governing/labels";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { getProvision } = useGoverningDocs(selectedOrgId);

const provisionId = computed(() => String(route.params.id ?? ""));

const { data, status, refresh } = await useAsyncData(
  () => `governing-provision-${provisionId.value}`,
  async () => {
    if (!selectedOrgId.value || !provisionId.value) return null;
    try {
      return await getProvision(provisionId.value);
    } catch {
      return null;
    }
  },
  { watch: [provisionId, selectedOrgId], server: false }
);
// No answer yet: before the first fetch (the server renders this, so the
// client must too) or during it. A refresh keeps the page on screen.
const waiting = computed(() => status.value === "idle" || (status.value === "pending" && !data.value));

const provision = computed(() => data.value?.provision ?? null);
const doc = computed(() => data.value?.document ?? null);

const provisionPath = (id: string) => buildOrgPath(`/governing/provisions/${id}`);
const documentPath = (id: string) => buildOrgPath(`/governing/${id}`);
const brief = (p: { citation: string | null; heading: string | null }) => [p.citation, p.heading].filter(Boolean).join(" · ");

const copyCitation = async () => {
  if (!data.value?.citation) return;
  try {
    await navigator.clipboard.writeText(data.value.citation);
    toast.success("Citation copied");
  } catch {
    toast.error("Could not copy. Select the citation and copy it by hand.");
  }
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div v-if="waiting" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <template v-else-if="!provision || !doc || !data">
        <BackLink :to="buildOrgPath('/governing')" label="Governing documents" />
        <AppEmptyState
          icon="lucide:scroll-text"
          title="Provision not found"
          description="It may have been removed, or its document is not published yet."
        />
      </template>

      <template v-else>
        <AppPageHeader
          :eyebrow="doc.title ?? kindLabel(doc.kind)"
          :title="provision.citation ?? 'Provision'"
          :description="provision.heading ?? undefined"
          :back-to="`${documentPath(doc.id)}#p-${provision.id}`"
          back-label="Reading view"
        />

        <div class="ios-card p-5 space-y-3">
          <div v-if="provision.review_state === 'ocr_draft' || provision.uncertain" class="flex flex-wrap gap-2">
            <Badge v-if="provision.review_state === 'ocr_draft'" variant="secondary">Not yet reviewed</Badge>
            <Badge v-if="provision.uncertain" variant="secondary">Uncertain reading</Badge>
          </div>
          <p class="governing-text type-body t-text">{{ provision.text }}</p>
        </div>

        <div class="ios-card p-4 space-y-4">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="type-micro t-text-muted">Citation</p>
              <p class="type-body t-text select-all" data-testid="governing-citation">{{ data.citation }}</p>
            </div>
            <Button variant="outline" @click="copyCitation">
              <Icon name="lucide:copy" class="w-4 h-4 mr-1.5" /> Copy Citation
            </Button>
          </div>

          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 border-t t-border pt-3">
            <div>
              <dt class="type-micro t-text-muted">Source document</dt>
              <dd class="type-body">
                <NuxtLink :to="documentPath(doc.id)" class="t-text-accent underline">{{ doc.title }}</NuxtLink>
              </dd>
            </div>
            <div v-if="formatBookAndPage(doc.or_book, provision.or_page_start, provision.or_page_end)">
              <dt class="type-micro t-text-muted">Recorded at</dt>
              <dd class="type-body t-text">{{ formatBookAndPage(doc.or_book, provision.or_page_start, provision.or_page_end) }}</dd>
            </div>
            <div v-if="doc.recorded_on">
              <dt class="type-micro t-text-muted">Recorded</dt>
              <dd class="type-body t-text">{{ formatRecordDate(doc.recorded_on) }}</dd>
            </div>
            <div v-if="data.parent">
              <dt class="type-micro t-text-muted">Part of</dt>
              <dd class="type-body">
                <NuxtLink :to="provisionPath(data.parent.id)" class="t-text-accent underline">{{ brief(data.parent) }}</NuxtLink>
              </dd>
            </div>
          </dl>
        </div>

        <section v-if="data.flags.length" class="space-y-2" data-testid="governing-flags">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="type-section t-text">State law</h2>
            <NuxtLink :to="buildOrgPath('/governing/overview')" class="type-meta t-text-accent underline">Overview</NuxtLink>
          </div>
          <p class="type-meta t-text-secondary" data-testid="governing-flag-notice">{{ FLAG_NOTICE }}</p>
          <div class="space-y-3">
            <GoverningStatuteFlag
              v-for="flag in data.flags"
              :key="flag.id"
              :flag="flag"
              :org-id="selectedOrgId"
              :can-manage="data.can_manage"
              @changed="refresh()"
            />
          </div>
        </section>

        <GoverningOriginalDocuments :sources="data.sources" :org-id="selectedOrgId" />

        <section v-if="data.links.length || data.document_amends" class="space-y-2">
          <h2 class="type-section t-text">Amendment chain</h2>
          <ul class="ios-card divide-y t-border">
            <li v-for="link in data.links" :key="link.id" class="px-4 py-3 space-y-1">
              <p class="type-body t-text">
                <span class="t-text-secondary">{{ linkLabel(link.type, link.direction) }}</span>
                {{ " " }}
                <NuxtLink :to="provisionPath(link.other.id)" class="t-text-accent underline">{{ brief(link.other) }}</NuxtLink>
              </p>
              <p v-if="link.other_document_title" class="type-meta t-text-muted">{{ link.other_document_title }}</p>
              <p v-if="link.note" class="governing-text type-meta t-text-secondary">{{ link.note }}</p>
            </li>
            <li v-if="data.document_amends" class="px-4 py-3">
              <p class="type-body t-text">
                <span class="t-text-secondary">This document amends</span>
                {{ " " }}
                <NuxtLink :to="documentPath(data.document_amends.id)" class="t-text-accent underline">{{ data.document_amends.title }}</NuxtLink>
              </p>
            </li>
          </ul>
        </section>

        <section v-if="data.children.length" class="space-y-2">
          <h2 class="type-section t-text">Subsections</h2>
          <ul class="ios-card divide-y t-border">
            <li v-for="child in data.children" :key="child.id" class="px-4 py-2.5">
              <NuxtLink :to="provisionPath(child.id)" class="type-body t-text-accent underline">{{ brief(child) }}</NuxtLink>
            </li>
          </ul>
        </section>

        <nav aria-label="Neighbouring provisions" class="flex items-start justify-between gap-4 border-t t-border pt-4">
          <NuxtLink v-if="data.previous" :to="provisionPath(data.previous.id)" class="type-meta t-text-secondary hover:t-text min-w-0">
            <span class="type-micro t-text-muted block">Previous</span>
            {{ brief(data.previous) }}
          </NuxtLink>
          <span v-else />
          <NuxtLink v-if="data.next" :to="provisionPath(data.next.id)" class="type-meta t-text-secondary hover:t-text min-w-0 text-right">
            <span class="type-micro t-text-muted block">Next</span>
            {{ brief(data.next) }}
          </NuxtLink>
        </nav>
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
