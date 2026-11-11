<script setup lang="ts">
// Governing documents: the change history (spec §7). Every audited change to
// the community's governing documents, newest first, with what was there
// before and after. Read-only, and only for people who manage the documents:
// the server refuses anyone else.
import { AUDIT_ACTIONS, auditActionLabel, auditChanges } from "#core/shared/governing/audit";
import type { GoverningAuditEntry } from "#core/app/composables/useGoverningDocs";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const route = useRoute();
const router = useRouter();
const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { getAudit, listDocuments } = useGoverningDocs(selectedOrgId);

// The Select cannot hold an empty value, so "all" stands for no filter.
const ALL = "all";
const one = (v: unknown) => (typeof v === "string" && v ? v : "");
const documentFilter = ref(one(route.query.document) || ALL);
const actionFilter = ref(AUDIT_ACTIONS.find((a) => a === route.query.action) ?? ALL);
const params = computed(() => ({
  document: documentFilter.value === ALL ? "" : documentFilter.value,
  action: actionFilter.value === ALL ? "" : actionFilter.value,
}));

const { data: documentData } = await useAsyncData(
  "governing-documents",
  async () => (selectedOrgId.value ? await listDocuments() : null),
  { watch: [selectedOrgId], server: false }
);
const documents = computed(() => documentData.value?.documents ?? []);
const titleOf = (id: string | null) => documents.value.find((d) => d.id === id)?.title ?? null;

const entries = ref<GoverningAuditEntry[]>([]);
const nextBefore = ref<string | null>(null);
const state = ref<"loading" | "ready" | "error" | "forbidden">("loading");
const loadingMore = ref(false);
let run = 0;

const load = async () => {
  if (!selectedOrgId.value) return;
  const mine = ++run;
  state.value = "loading";
  try {
    const page = await getAudit(params.value);
    if (mine !== run) return;
    entries.value = page.entries;
    nextBefore.value = page.next_before;
    state.value = "ready";
  } catch (error: any) {
    if (mine !== run) return;
    state.value = error?.statusCode === 403 || error?.status === 403 ? "forbidden" : "error";
  }
};
const loadMore = async () => {
  if (!nextBefore.value || loadingMore.value) return;
  const mine = run;
  loadingMore.value = true;
  try {
    const page = await getAudit({ ...params.value, before: nextBefore.value });
    if (mine !== run) return;
    entries.value = [...entries.value, ...page.entries];
    nextBefore.value = page.next_before;
  } catch {
    state.value = "error";
  } finally {
    loadingMore.value = false;
  }
};

watch(
  params,
  (p) => {
    router.replace({ query: { ...(p.document ? { document: p.document } : {}), ...(p.action ? { action: p.action } : {}) } });
    load();
  },
  { deep: true }
);
watch(selectedOrgId, load);
onMounted(load);

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const who = (e: GoverningAuditEntry) => e.actor_name || e.actor_email || "Unknown";
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <AppPageHeader
        eyebrow="Governing documents"
        title="Change history"
        description="Every recorded change to these documents: who made it, when, and what was there before and after."
        :back-to="buildOrgPath('/governing')"
        back-label="Governing documents"
      />

      <AppEmptyState
        v-if="state === 'forbidden'"
        icon="lucide:lock"
        title="The change history is for people who manage governing documents"
        description="Ask a board member or an administrator if you need something from it."
      />

      <template v-else>
        <div class="flex flex-wrap items-center gap-2">
          <Select v-model="documentFilter">
            <SelectTrigger class="w-56" aria-label="Document"><SelectValue placeholder="Document" /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL">All documents</SelectItem>
              <SelectItem v-for="d in documents" :key="d.id" :value="d.id">{{ d.title }}</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="actionFilter">
            <SelectTrigger class="w-60" aria-label="Kind of change"><SelectValue placeholder="Kind of change" /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL">Every kind of change</SelectItem>
              <SelectItem v-for="a in AUDIT_ACTIONS" :key="a" :value="a">{{ auditActionLabel(a) }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <AppEmptyState
          v-if="state === 'error'"
          icon="lucide:triangle-alert"
          title="The change history could not be loaded"
          description="Reload the page to try again."
        />

        <div v-else-if="state === 'loading'" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

        <AppEmptyState
          v-else-if="!entries.length"
          icon="lucide:history"
          title="No changes recorded"
          :description="params.document || params.action ? 'Nothing matches these filters.' : 'Changes appear here as they are made.'"
        />

        <template v-else>
          <ul class="space-y-2" data-testid="governing-audit">
            <li v-for="entry in entries" :key="entry.id" class="ios-card px-4 py-3 space-y-2" :data-action="entry.action">
              <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
                <div class="flex-1 min-w-0">
                  <p class="type-micro t-text-muted">{{ auditActionLabel(entry.action) }}</p>
                  <p class="type-body t-text mt-0.5">{{ entry.summary }}</p>
                </div>
                <p class="type-meta t-text-muted text-right">
                  <span class="block">{{ when(entry.occurred_at) }}</span>
                  <span class="block">{{ who(entry) }}</span>
                </p>
              </div>
              <p v-if="entry.reason" class="type-meta t-text-secondary whitespace-pre-wrap">Reason: {{ entry.reason }}</p>
              <p v-if="entry.document || entry.provision" class="type-meta flex flex-wrap gap-x-3 gap-y-0.5">
                <NuxtLink v-if="entry.document && titleOf(entry.document)" :to="buildOrgPath(`/governing/${entry.document}`)" class="t-text-accent underline">
                  {{ titleOf(entry.document) }}
                </NuxtLink>
                <NuxtLink
                  v-if="entry.provision && entry.action !== 'provision_merge'"
                  :to="buildOrgPath(`/governing/provisions/${entry.provision}`)"
                  class="t-text-accent underline"
                >
                  Open Provision
                </NuxtLink>
              </p>
              <details v-if="auditChanges(entry.before, entry.after).length">
                <summary class="type-meta t-text-accent cursor-pointer">Before and after</summary>
                <dl class="mt-2 space-y-3">
                  <div v-for="change in auditChanges(entry.before, entry.after)" :key="change.field" class="space-y-1">
                    <dt v-if="change.field" class="type-micro t-text-muted">{{ change.field }}</dt>
                    <dd class="grid gap-2 sm:grid-cols-2">
                      <div class="rounded-lg border t-border p-2 min-w-0">
                        <p class="type-micro t-text-muted">Before</p>
                        <p class="type-meta t-text whitespace-pre-wrap break-words">{{ change.before || "(nothing)" }}</p>
                      </div>
                      <div class="rounded-lg border t-border p-2 min-w-0">
                        <p class="type-micro t-text-muted">After</p>
                        <p class="type-meta t-text whitespace-pre-wrap break-words">{{ change.after || "(nothing)" }}</p>
                      </div>
                    </dd>
                  </div>
                </dl>
              </details>
            </li>
          </ul>

          <div v-if="nextBefore" class="flex justify-center">
            <Button variant="outline" :disabled="loadingMore" @click="loadMore">Load More</Button>
          </div>
        </template>
      </template>
    </PageContainer>
  </div>
</template>
