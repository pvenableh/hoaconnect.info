<script setup lang="ts">
// Governing documents: search. Ranking and visibility are the server's
// (core/shared/governing/search.ts); this page holds the query and the spec §6
// filters in the URL so a search can be linked to and survives Back.
import { FLAG_NOTICE, RELATIONSHIP_LABELS, RELATIONSHIP_ORDER, SEVERITY_ORDER } from "#core/shared/governing/flags";
import { kindLabel, splitHighlight } from "#core/shared/governing/labels";
import { MAX_QUERY, MIN_QUERY } from "#core/shared/governing/search";
import type { Relationship, Severity } from "#core/shared/governing/types";
import type { GoverningSearchResult } from "#core/app/composables/useGoverningDocs";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const route = useRoute();
const router = useRouter();
const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { listDocuments, search } = useGoverningDocs(selectedOrgId);

// The Select cannot hold an empty value, so "all" stands for no filter.
const ALL = "all";
const one = (v: unknown) => (typeof v === "string" && v ? v : "");

const query = ref(one(route.query.q));
const documentFilter = ref(one(route.query.document) || ALL);
const kindFilter = ref(one(route.query.kind) || ALL);
const hasFlags = ref(route.query.hasFlags === "true");
const relationshipFilter = ref<string>(RELATIONSHIP_ORDER.find((r) => r === route.query.relationship) ?? ALL);
const severityFilter = ref<string>(SEVERITY_ORDER.find((s) => s === route.query.severity) ?? ALL);
const debouncedQuery = refDebounced(query, 250);

const { data: documentData } = await useAsyncData(
  "governing-documents",
  async () => (selectedOrgId.value ? await listDocuments() : null),
  { watch: [selectedOrgId], server: false }
);
const documents = computed(() => documentData.value?.documents ?? []);
const kinds = computed(() => [...new Set(documents.value.map((d) => d.kind).filter((k): k is string => !!k))]);

const SEVERITY_LABELS: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low", info: "Info" };

const params = computed(() => ({
  q: debouncedQuery.value.trim(),
  document: documentFilter.value === ALL ? "" : documentFilter.value,
  kind: kindFilter.value === ALL ? "" : kindFilter.value,
  hasFlags: hasFlags.value,
  relationship: relationshipFilter.value === ALL ? "" : relationshipFilter.value,
  severity: severityFilter.value === ALL ? "" : severityFilter.value,
}));
const hasFilter = computed(() => {
  const p = params.value;
  return !!(p.document || p.kind || p.hasFlags || p.relationship || p.severity);
});
const canSearch = computed(() => params.value.q.length >= MIN_QUERY || hasFilter.value);

const results = ref<GoverningSearchResult[]>([]);
const total = ref(0);
const searchedFor = ref("");
const loading = ref(false);
const failed = ref(false);
let latest = 0;

const run = async () => {
  const p = params.value;
  const urlQuery: Record<string, string> = {};
  if (p.q) urlQuery.q = p.q;
  if (p.document) urlQuery.document = p.document;
  if (p.kind) urlQuery.kind = p.kind;
  if (p.hasFlags) urlQuery.hasFlags = "true";
  if (p.relationship) urlQuery.relationship = p.relationship;
  if (p.severity) urlQuery.severity = p.severity;
  await router.replace({ query: urlQuery });

  if (!selectedOrgId.value || !canSearch.value) {
    results.value = [];
    total.value = 0;
    searchedFor.value = "";
    return;
  }
  const ticket = ++latest;
  loading.value = true;
  failed.value = false;
  try {
    const found = await search({
      q: p.q,
      document: p.document,
      kind: p.kind,
      hasFlags: p.hasFlags,
      relationship: (p.relationship || undefined) as Relationship | undefined,
      severity: (p.severity || undefined) as Severity | undefined,
    });
    if (ticket !== latest) return;
    results.value = found.results;
    total.value = found.total;
    searchedFor.value = found.query;
  } catch (e) {
    if (ticket !== latest) return;
    console.error("Governing search failed:", e);
    results.value = [];
    total.value = 0;
    failed.value = true;
  } finally {
    if (ticket === latest) loading.value = false;
  }
};

watch([params, selectedOrgId], run, { immediate: true, deep: true });

const clearFilters = () => {
  documentFilter.value = ALL;
  kindFilter.value = ALL;
  hasFlags.value = false;
  relationshipFilter.value = ALL;
  severityFilter.value = ALL;
};

const MATCH_LABELS: Record<GoverningSearchResult["matched"], string> = {
  citation: "Citation match",
  heading: "Heading match",
  text: "Text match",
  filter: "",
};
const anyFlags = computed(() => results.value.some((r) => r.flags.length));
const relationshipsOf = (r: GoverningSearchResult) => [...new Set(r.flags.map((f) => f.relationship))];
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-5">
      <AppPageHeader
        eyebrow="Governing documents"
        title="Search"
        :back-to="buildOrgPath('/governing')"
        back-label="Governing documents"
      />

      <Input
        v-model="query"
        type="search"
        class="glass-field"
        :maxlength="MAX_QUERY"
        placeholder="A citation or words, for example By-Law 3.5 or proxies"
        aria-label="Search governing documents"
        autofocus
      />

      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="documentFilter">
          <SelectTrigger class="w-56" aria-label="Document"><SelectValue placeholder="Document" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">All documents</SelectItem>
            <SelectItem v-for="d in documents" :key="d.id" :value="d.id">{{ d.title }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="kindFilter">
          <SelectTrigger class="w-44" aria-label="Kind of document"><SelectValue placeholder="Kind" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">All kinds</SelectItem>
            <SelectItem v-for="k in kinds" :key="k" :value="k">{{ kindLabel(k) }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="relationshipFilter">
          <SelectTrigger class="w-60" aria-label="Relationship to state law"><SelectValue placeholder="Relationship" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">Any relationship to state law</SelectItem>
            <SelectItem v-for="r in RELATIONSHIP_ORDER" :key="r" :value="r">{{ RELATIONSHIP_LABELS[r] }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="severityFilter">
          <SelectTrigger class="w-40" aria-label="Severity"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">Any severity</SelectItem>
            <SelectItem v-for="s in SEVERITY_ORDER" :key="s" :value="s">{{ SEVERITY_LABELS[s] }}</SelectItem>
          </SelectContent>
        </Select>
        <ActionButton icon="lucide:flag" :pressed="hasFlags" @click="hasFlags = !hasFlags">Has Statute Notes</ActionButton>
        <ActionButton v-if="hasFilter" icon="lucide:x" @click="clearFilters">Clear Filters</ActionButton>
      </div>

      <div v-if="loading && !results.length" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

      <AppEmptyState
        v-else-if="failed"
        icon="lucide:triangle-alert"
        title="The search could not be run"
        description="Reload the page to try again."
      />

      <p v-else-if="!canSearch" class="type-body t-text-muted py-8 text-center">
        Type at least {{ MIN_QUERY }} characters, or choose a filter. Exact citations come first.
      </p>

      <AppEmptyState
        v-else-if="!results.length"
        variant="search"
        title="No provisions match"
        description="Try fewer words, a citation such as By-Law 3.5, or clear the filters."
      />

      <template v-else>
        <p class="type-meta t-text-muted" aria-live="polite">
          <template v-if="total > results.length">Showing the first {{ results.length }} of {{ total }} provisions</template>
          <template v-else>{{ total }} {{ total === 1 ? "provision" : "provisions" }}</template>
        </p>

        <ol class="space-y-2">
          <li v-for="r in results" :key="r.provision.id">
            <NuxtLink :to="buildOrgPath(`/governing/provisions/${r.provision.id}`)" class="ios-card block px-4 py-3 space-y-1">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 class="type-card t-text">
                  {{ r.provision.citation }}<template v-if="r.provision.heading"> · {{ r.provision.heading }}</template>
                </h2>
                <span v-if="MATCH_LABELS[r.matched]" class="type-micro t-text-muted">{{ MATCH_LABELS[r.matched] }}</span>
              </div>
              <p class="type-meta t-text-muted">{{ r.document.title }} · {{ r.citation }}</p>
              <p v-if="r.excerpt" class="governing-text type-body t-text-secondary">
                <template v-if="r.excerpt.clippedStart">… </template>
                <template v-for="(part, i) in splitHighlight(r.excerpt.text, searchedFor)" :key="i">
                  <mark v-if="part.match" class="governing-mark">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
                <template v-if="r.excerpt.clippedEnd"> …</template>
              </p>
              <div v-if="r.flags.length" class="flex flex-wrap gap-1.5 pt-1">
                <Badge v-for="rel in relationshipsOf(r)" :key="rel" variant="secondary">{{ RELATIONSHIP_LABELS[rel] }}</Badge>
              </div>
            </NuxtLink>
          </li>
        </ol>

        <p v-if="anyFlags" class="type-meta t-text-muted">{{ FLAG_NOTICE }}</p>
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
.governing-mark {
  background: color-mix(in srgb, var(--primary) 22%, transparent);
  color: inherit;
  border-radius: 0.2rem;
  padding: 0 0.1rem;
}
</style>
