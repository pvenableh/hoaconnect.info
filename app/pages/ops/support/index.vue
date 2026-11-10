<script setup lang="ts">
// Operator console: the platform support inbox (plan §5, Phase 3). App Admin
// and Platform Support. Filters by status and category; newest activity first.
import { SUPPORT_CATEGORIES, SUPPORT_STATUS_LABEL_STAFF } from "#core/shared/support/access";
import { relativeDays } from "#core/shared/ops/format";

definePageMeta({ middleware: ["auth"], layout: "auth" });
useHead({ title: "Support · Operations" });

const route = useRoute();
const router = useRouter();
const status = computed(() => (typeof route.query.status === "string" ? route.query.status : "active"));
const category = computed(() => (typeof route.query.category === "string" ? route.query.category : ""));
const q = ref(typeof route.query.q === "string" ? route.query.q : "");

const { data, pending, error, refresh } = await useFetch<any>("/api/ops/support", {
  query: computed(() => ({ status: status.value, category: category.value || undefined, q: route.query.q || undefined })),
});

function set(next: Record<string, string | undefined>) {
  void router.replace({ query: { ...route.query, ...next } });
}
const statuses = computed(() => [
  { value: "active", label: `Open (${(data.value?.counts?.new ?? 0) + (data.value?.counts?.open ?? 0) + (data.value?.counts?.waiting ?? 0)})` },
  { value: "new", label: `New (${data.value?.counts?.new ?? 0})` },
  { value: "waiting", label: `Waiting (${data.value?.counts?.waiting ?? 0})` },
  { value: "closed", label: `Closed (${data.value?.counts?.closed ?? 0})` },
]);
const categoryLabel = (v: string) => SUPPORT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const PRIORITY_TONE: Record<string, string> = { urgent: "text-destructive", high: "text-warning", normal: "t-text-muted", low: "t-text-muted" };
</script>

<template>
  <OpsShell title="Support" description="Requests to HOA Connect from communities, and the ones HOA Connect raised itself.">
    <div class="flex flex-wrap items-center gap-2">
      <AppSegmentedControl :items="statuses" :model-value="status" size="sm" label="Status" @update:model-value="(v: string) => set({ status: v })" />
      <select
        :value="category"
        class="rounded-lg border border-[var(--theme-border-primary)] bg-transparent px-2 py-1.5 type-meta t-text"
        aria-label="Category"
        @change="(e: any) => set({ category: e.target.value || undefined })"
      >
        <option value="">Every category</option>
        <option v-for="c in SUPPORT_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
      <form class="min-w-0 flex-1" @submit.prevent="set({ q: q || undefined })">
        <Input v-model="q" placeholder="Search subjects" class="h-8" />
      </form>
    </div>

    <div v-if="error" class="py-10">
      <AppEmptyState title="Couldn't load the inbox" :description="error.statusMessage || error.message" icon="lucide:triangle-alert" />
    </div>
    <ul v-else-if="data?.requests?.length" class="mt-4 divide-y divide-[var(--theme-border-light)] ios-card">
      <li v-for="r in data.requests" :key="r.id">
        <NuxtLink :to="`/ops/support/${r.id}`" class="flex items-start justify-between gap-3 px-4 py-3 hover:t-bg-subtle">
          <span class="min-w-0">
            <span class="flex items-center gap-2">
              <span v-if="r.awaitingUs" class="size-2 shrink-0 rounded-full bg-info" aria-label="Waiting on HOA Connect" />
              <span class="truncate type-body t-text">{{ r.subject }}</span>
            </span>
            <span class="block type-micro t-text-muted">
              {{ categoryLabel(r.category) }}
              <template v-if="r.community"> · {{ r.community.name }}</template>
              <template v-if="r.requester"> · {{ r.requester }}</template>
              · {{ relativeDays(r.lastMessageAt) }}
            </span>
          </span>
          <span class="shrink-0 text-right">
            <span class="block type-micro t-text-secondary">{{ SUPPORT_STATUS_LABEL_STAFF[r.status as keyof typeof SUPPORT_STATUS_LABEL_STAFF] ?? r.status }}</span>
            <span v-if="r.priority !== 'normal'" :class="['block type-micro', PRIORITY_TONE[r.priority]]">{{ r.priority }}</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
    <AppEmptyState v-else-if="!pending" class="mt-6" title="Nothing here" description="No requests match these filters." icon="lucide:inbox" />

    <div class="mt-3 flex justify-end">
      <Button variant="ghost" size="sm" :disabled="pending" @click="refresh()">Refresh</Button>
    </div>
  </OpsShell>
</template>
