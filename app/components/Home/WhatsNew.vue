<script setup lang="ts">
/**
 * HomeWhatsNew — band 3 for the admin and manager homes
 * (docs/plan-unified-experience.md §5): the newest published announcements and
 * documents of the community, newest first. Member homes put their own
 * announcements and documents cards in this band instead.
 */
const props = defineProps<{ organizationId?: string | null }>();
const fallbackOrg = useState<string | null>("selectedOrgId", () => null);
const orgId = computed(() => props.organizationId || fallbackOrg.value);
const { buildOrgPath } = useOrgNavigation();

const annApi = useDirectusItems("hoa_announcements");
const docApi = useDirectusItems("hoa_documents");

interface Item { key: string; icon: string; title: string; date: string | null; path: string }

const { data, status } = useAsyncData(
  () => `home-whats-new-${orgId.value}`,
  async (): Promise<Item[]> => {
    if (!orgId.value) return [];
    const org = { organization: { _eq: orgId.value }, status: { _eq: "published" } };
    const [anns, docs] = await Promise.all([
      annApi.list({ fields: ["id", "title", "publish_date", "date_created"], filter: org, sort: ["-publish_date", "-date_created"], limit: 4 }).catch(() => []),
      docApi.list({ fields: ["id", "title", "date_published", "date_created"], filter: org, sort: ["-date_published", "-date_created"], limit: 3 }).catch(() => []),
    ]);
    const items: Item[] = [
      ...(anns as any[]).map((a) => ({ key: `a-${a.id}`, icon: "i-lucide-megaphone", title: a.title || "Announcement", date: a.publish_date || a.date_created || null, path: "/announcements" })),
      ...(docs as any[]).map((d) => ({ key: `d-${d.id}`, icon: "i-lucide-file-text", title: d.title || "Document", date: d.date_published || d.date_created || null, path: "/documents" })),
    ];
    return items.sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? "")).slice(0, 6);
  },
  { watch: [orgId], server: false, default: () => [] },
);
// server: false renders "idle" on the server: count it as loading so hydration agrees.
const pending = computed(() => status.value === "idle" || status.value === "pending");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
</script>

<template>
  <div class="space-y-3" data-testid="home-whats-new">
    <h2 class="t-eyebrow">What's new</h2>
    <AppCard class="overflow-hidden py-0">
      <ul class="divide-y">
        <li v-for="i in data" :key="i.key">
          <NuxtLink :to="buildOrgPath(i.path)" class="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted/50">
            <Icon :name="i.icon" class="h-4 w-4 shrink-0 t-text-muted" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium t-text">{{ i.title }}</span>
            <span class="shrink-0 text-xs t-text-muted tabular-nums">{{ day(i.date) }}</span>
          </NuxtLink>
        </li>
        <li v-if="!data?.length" class="px-4 py-3 text-sm t-text-muted">
          {{ pending ? "Loading…" : "Nothing has been published recently." }}
        </li>
      </ul>
    </AppCard>
  </div>
</template>
