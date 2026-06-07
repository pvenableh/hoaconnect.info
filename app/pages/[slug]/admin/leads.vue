<script setup lang="ts">
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { list, updateRequest } = useRequests();

const { data: leads, pending, refresh } = await useAsyncData(
  `admin-leads-${selectedOrgId.value}`,
  () => list({ category: { _eq: "landing_inquiry" } }, ["-date_created"]),
  { watch: [selectedOrgId], server: false }
);

const statusFilter = ref<"open" | "resolved" | "all">("open");
const filtered = computed(() => {
  let rows = leads.value || [];
  if (statusFilter.value === "open")
    rows = rows.filter((r: any) => r.status !== "resolved" && r.status !== "closed");
  else if (statusFilter.value === "resolved")
    rows = rows.filter((r: any) => r.status === "resolved" || r.status === "closed");
  return rows;
});
const openCount = computed(
  () => (leads.value || []).filter((r: any) => r.status !== "resolved" && r.status !== "closed").length
);

const CATEGORY_LABEL: Record<string, string> = {
  sale: "Purchase",
  rental: "Rental",
  general: "General",
};
const meta = (r: any) => r.metadata || {};
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

const busy = ref<string | null>(null);
const setStatus = async (id: string, status: string) => {
  busy.value = id;
  try {
    await updateRequest(id, { status } as any);
    await refresh();
  } finally {
    busy.value = null;
  }
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          class="mb-2 -ml-2"
          @click="navigateTo(buildOrgPath('/admin/requests'))"
        >
          <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1.5" />
          Requests
        </Button>
        <div class="flex items-center justify-between gap-2">
          <div>
            <h1 class="text-2xl font-semibold t-text">Website leads</h1>
            <p class="text-sm t-text-muted mt-0.5">
              Inquiries submitted from your public landing page.
            </p>
          </div>
          <span
            v-if="openCount"
            class="text-[10px] uppercase font-semibold px-2.5 py-1 rounded-full bg-primary text-primary-foreground"
          >
            {{ openCount }} new
          </span>
        </div>
      </div>

      <!-- Status filter -->
      <div class="flex gap-1.5">
        <button
          v-for="opt in [
            { key: 'open', label: 'New' },
            { key: 'resolved', label: 'Handled' },
            { key: 'all', label: 'All' },
          ]"
          :key="opt.key"
          class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
          :class="statusFilter === opt.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
          @click="statusFilter = opt.key as any"
        >
          {{ opt.label }}
        </button>
      </div>

      <div v-if="pending" class="flex justify-center py-16"><div class="spinner-ios" /></div>

      <div v-else-if="!filtered.length" class="ios-card p-10 text-center">
        <Icon name="lucide:inbox" class="w-10 h-10 mx-auto mb-3 t-text-muted" />
        <p class="t-text-muted text-sm">No leads here yet.</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="lead in filtered"
          :key="lead.id"
          class="ios-card p-5 flex flex-col sm:flex-row sm:items-start gap-4"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                {{ CATEGORY_LABEL[meta(lead).inquiry_category] || "General" }}
              </span>
              <span class="text-xs t-text-muted">{{ fmtDate(lead.date_created) }}</span>
              <span
                v-if="lead.status === 'resolved' || lead.status === 'closed'"
                class="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700"
              >
                Handled
              </span>
            </div>
            <p class="font-medium t-text">{{ meta(lead).visitor_name || "Website visitor" }}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-sm">
              <a
                v-if="meta(lead).visitor_email"
                :href="`mailto:${meta(lead).visitor_email}`"
                class="t-link inline-flex items-center gap-1"
              >
                <Icon name="lucide:mail" class="w-3.5 h-3.5" />
                {{ meta(lead).visitor_email }}
              </a>
              <a
                v-if="meta(lead).visitor_phone"
                :href="`tel:${meta(lead).visitor_phone}`"
                class="t-link inline-flex items-center gap-1"
              >
                <Icon name="lucide:phone" class="w-3.5 h-3.5" />
                {{ meta(lead).visitor_phone }}
              </a>
            </div>
            <p v-if="lead.description" class="mt-2 text-sm t-text-secondary whitespace-pre-wrap">
              {{ lead.description }}
            </p>
          </div>

          <div class="shrink-0">
            <Button
              v-if="lead.status !== 'resolved' && lead.status !== 'closed'"
              size="sm"
              variant="outline"
              class="rounded-full"
              :disabled="busy === lead.id"
              @click="setStatus(lead.id, 'resolved')"
            >
              <Icon name="lucide:check" class="w-4 h-4 mr-1.5" />
              Mark handled
            </Button>
            <Button
              v-else
              size="sm"
              variant="ghost"
              class="rounded-full"
              :disabled="busy === lead.id"
              @click="setStatus(lead.id, 'open')"
            >
              Reopen
            </Button>
          </div>
        </div>
      </div>
    </PageContainer>
  </div>
</template>
