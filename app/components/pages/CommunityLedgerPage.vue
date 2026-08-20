<script setup lang="ts">
/**
 * The Community Ledger — the community's own record of itself, read back.
 *
 * ONE component behind two routes: `/{slug}/admin/ledger` for the board and
 * `/{slug}/ledger` for owners. There is no admin variant of the data, because
 * there is no admin variant of the truth — `GET /api/org/ledger` narrows rows to
 * the tiers the caller may read and the same page renders whatever comes back.
 * Two components would be two chances for the board's copy and the owners' copy
 * of a community's history to disagree.
 *
 * The org comes from the route slug rather than the selected org: the selected
 * org falls back to the user's first membership on a hard navigation, and a
 * bookmarked ledger showing a different community's history would be the worst
 * possible bug on this particular screen.
 */
import {
  descriptorFor,
  LEDGER_CATEGORIES,
  type LedgerCategory,
} from "#core/shared/ledger/events";
import { formatDateTime, groupByMonth, payloadRows } from "#core/shared/ledger/format";
import type { StoredLedgerEntry } from "#core/shared/ledger/entry";

const props = withDefaults(
  defineProps<{
    /** "Records" for the board, "Your community" for owners. */
    eyebrow?: string;
    subtitle?: string;
    /** Show the owner-facing "Ask your community" box above the feed. */
    showAsk?: boolean;
  }>(),
  {
    showAsk: false,
    eyebrow: "Records",
    subtitle:
      "What happened to your community, in the order it happened. Every entry is permanent — corrections are new entries, never edits.",
  }
);

interface TypeCount {
  key: string;
  label: string;
  category: LedgerCategory;
  icon: string;
  count: number;
}

interface LedgerResponse {
  entries: StoredLedgerEntry[];
  total: number;
  limit: number;
  offset: number;
  types: TypeCount[];
  viewer: { tiers: string[]; seesBoardOnly: boolean };
}

const PAGE_SIZE = 50;

const route = useRoute();
const slug = computed(() => String(route.params.slug || ""));

const loading = ref(true);
const loadingMore = ref(false);
const accessDenied = ref(false);
const failed = ref(false);
const entries = ref<StoredLedgerEntry[]>([]);
const total = ref(0);
const types = ref<TypeCount[]>([]);
const seesBoardOnly = ref(false);
const category = ref<LedgerCategory | "">("");
const expanded = ref<Record<string, boolean>>({});

/**
 * The viewer's own zone, so an evening entry is filed under the month it reads
 * as. Resolved once on the client; SSR falls back to UTC rather than guessing.
 */
const timeZone = computed(() =>
  import.meta.client ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"
);

const load = async (append = false) => {
  if (!slug.value) return;
  if (append) loadingMore.value = true;
  else {
    loading.value = true;
    accessDenied.value = false;
    failed.value = false;
  }
  try {
    const res = await $fetch<LedgerResponse>("/api/org/ledger", {
      query: {
        slug: slug.value,
        limit: PAGE_SIZE,
        offset: append ? entries.value.length : 0,
        ...(category.value ? { category: category.value } : {}),
      },
    });
    entries.value = append ? [...entries.value, ...(res.entries || [])] : res.entries || [];
    total.value = res.total || 0;
    types.value = res.types || [];
    seesBoardOnly.value = res.viewer?.seesBoardOnly === true;
  } catch (err: any) {
    const status = err?.statusCode || err?.response?.status;
    if (status === 403) accessDenied.value = true;
    else failed.value = true;
    if (!append) entries.value = [];
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

onMounted(() => load());
watch(category, () => load());

/** Only the categories this community actually has entries in — no empty chips. */
const availableCategories = computed(() => {
  const counts = new Map<string, number>();
  for (const t of types.value) counts.set(t.category, (counts.get(t.category) ?? 0) + t.count);
  return LEDGER_CATEGORIES.filter((c) => counts.has(c.key)).map((c) => ({
    ...c,
    count: counts.get(c.key) ?? 0,
  }));
});

const months = computed(() => groupByMonth(entries.value, timeZone.value));
const hasMore = computed(() => entries.value.length < total.value);

const describe = (entry: StoredLedgerEntry) => descriptorFor(entry.event_type);
const when = (entry: StoredLedgerEntry) => formatDateTime(entry.occurred_at, timeZone.value);
const details = (entry: StoredLedgerEntry) =>
  payloadRows(entry.payload, { timeZone: timeZone.value });
const toggle = (id: string) => {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] };
};

/** Board-only rows are marked, so a board member knows what an owner cannot see. */
const isBoardOnly = (entry: StoredLedgerEntry) => entry.visibility === "board";
</script>

<template>
  <div class="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
    <header>
      <p class="text-xs uppercase tracking-ultra-wide t-text-muted">{{ props.eyebrow }}</p>
      <h1 class="text-2xl font-semibold t-text">Ledger</h1>
      <p class="text-sm t-text-secondary max-w-2xl mt-1">{{ props.subtitle }}</p>
    </header>

    <!-- The owner surface only. A board member has the whole feed and the admin
         tools; the person this is FOR is the owner who would otherwise have to
         ask someone. Gated on the prop rather than on a role check so the page
         and the route cannot disagree about who is looking. -->
    <AiAskTheHoa v-if="props.showAsk && !accessDenied && !failed" :slug="slug" />

    <div v-if="accessDenied" class="rounded-xl border t-border p-8 text-center">
      <Icon name="i-lucide-lock" class="w-8 h-8 mx-auto mb-2 t-text-muted" />
      <p class="t-text font-medium">This community's ledger is for its members</p>
      <p class="text-sm t-text-muted">Ask an administrator for a seat in the community.</p>
    </div>

    <div v-else-if="failed" class="rounded-xl border t-border p-8 text-center">
      <Icon name="i-lucide-triangle-alert" class="w-8 h-8 mx-auto mb-2 t-text-muted" />
      <p class="t-text font-medium">The ledger couldn't be loaded</p>
      <button class="text-sm underline t-text-secondary mt-1" @click="load()">Try again</button>
    </div>

    <template v-else>
      <div v-if="availableCategories.length > 1" class="flex flex-wrap gap-1.5">
        <button
          class="px-3 py-1 text-xs font-medium rounded-full transition-colors"
          :class="category === '' ? 'bg-primary text-primary-foreground' : 't-bg-subtle t-text-secondary hover:t-bg'"
          @click="category = ''"
        >
          Everything
        </button>
        <button
          v-for="c in availableCategories"
          :key="c.key"
          class="px-3 py-1 text-xs font-medium rounded-full transition-colors inline-flex items-center gap-1.5"
          :class="category === c.key ? 'bg-primary text-primary-foreground' : 't-bg-subtle t-text-secondary hover:t-bg'"
          @click="category = c.key"
        >
          <Icon :name="`i-lucide-${c.icon}`" class="w-3.5 h-3.5" />
          {{ c.label }}
          <span class="tabular-nums opacity-70">{{ c.count }}</span>
        </button>
      </div>

      <WidgetRowSkeleton v-if="loading" :rows="6" :lines="2" />

      <div v-else-if="!entries.length" class="rounded-xl border t-border p-10 text-center">
        <Icon name="i-lucide-history" class="w-8 h-8 mx-auto mb-2 t-text-muted" />
        <p class="t-text font-medium">Nothing recorded yet</p>
        <p class="text-sm t-text-muted max-w-md mx-auto mt-1">
          The ledger records what happens to your community — management changes,
          permissions, published documents, decided votes. It fills itself as
          those things happen.
        </p>
      </div>

      <div v-else class="space-y-8">
        <section v-for="month in months" :key="month.key" class="space-y-2">
          <h2 class="text-xs font-semibold uppercase tracking-ultra-wide t-text-muted sticky top-0 t-bg py-2 z-10">
            {{ month.label }}
          </h2>

          <ul class="space-y-2">
            <li
              v-for="entry in month.entries"
              :key="entry.id"
              :id="`entry-${entry.id}`"
              class="rounded-xl border t-border overflow-hidden scroll-mt-16"
            >
              <div class="flex items-start gap-3 p-4">
                <!-- Accent TINT under accent text; see the warning in theme.css. -->
                <span class="mt-0.5 shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full t-bg-accent/15 t-text-accent">
                  <Icon :name="`i-lucide-${describe(entry).icon}`" class="w-4 h-4" />
                </span>

                <div class="min-w-0 flex-1">
                  <p class="t-text font-medium">{{ entry.summary }}</p>
                  <p class="text-xs t-text-muted mt-1">
                    {{ when(entry) }}
                    <template v-if="entry.actor_name"> · {{ entry.actor_name }}</template>
                  </p>

                  <div class="mt-2 flex flex-wrap items-center gap-1.5">
                    <span class="inline-flex items-center rounded-full t-bg-subtle t-text-secondary px-2 py-0.5 text-[11px] font-medium">
                      {{ describe(entry).label }}
                    </span>
                    <span
                      v-if="isBoardOnly(entry)"
                      class="inline-flex items-center gap-1 rounded-full t-bg-subtle t-text-muted px-2 py-0.5 text-[11px] font-medium"
                      title="Only the board, the administrator and a property manager can see this entry."
                    >
                      <Icon name="i-lucide-eye-off" class="w-3 h-3" />
                      Board only
                    </span>
                    <button
                      v-if="details(entry).length"
                      class="text-[11px] underline t-text-secondary ml-1"
                      @click="toggle(entry.id)"
                    >
                      {{ expanded[entry.id] ? "Hide details" : "Details" }}
                    </button>
                  </div>
                </div>
              </div>

              <dl v-if="expanded[entry.id]" class="border-t t-border-divider t-bg-subtle px-4 py-3 space-y-1">
                <div
                  v-for="(row, i) in details(entry)"
                  :key="`${entry.id}-${i}`"
                  class="flex flex-wrap gap-x-2 text-sm"
                  :style="{ paddingLeft: `${row.depth * 12}px` }"
                >
                  <dt class="t-text-muted">{{ row.label }}<template v-if="row.value">:</template></dt>
                  <dd class="t-text">{{ row.value }}</dd>
                </div>
              </dl>
            </li>
          </ul>
        </section>

        <div v-if="hasMore" class="text-center">
          <button
            class="px-4 py-2 text-sm rounded-lg border t-border t-text-secondary hover:t-text disabled:opacity-60"
            :disabled="loadingMore"
            @click="load(true)"
          >
            {{ loadingMore ? "Loading…" : `Load older entries (${total - entries.length} more)` }}
          </button>
        </div>
      </div>

      <!--
        The line from core/shared/ledger/entry.ts, said out loud to the person
        reading the feed. A ledger that does not explain what it excludes reads
        either as surveillance or as an incomplete record; it is neither.
      -->
      <p class="text-xs t-text-muted border-t t-border-divider pt-4 max-w-2xl">
        The ledger records outcomes, not discussions. Board conversations, drafts
        and comment threads are deliberately never written here.
        <template v-if="!loading && !seesBoardOnly">
          A small number of entries — anything naming one household's account —
          are visible only to the board.
        </template>
      </p>
    </template>
  </div>
</template>
