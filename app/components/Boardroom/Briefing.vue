<script setup lang="ts">
/**
 * The briefing itself — plain prose, and the financial position behind it when
 * the session is about money.
 *
 * The prose arrives with the `TL;DR:` line already stripped (that is
 * `<BoardroomSlides>`), so this renders paragraphs and nothing else. No
 * markdown parser: the planner is instructed to write plain sentences with no
 * headings, bold or bullet characters, and rendering it as anything richer
 * would invite it to start.
 *
 * The money block is the same arithmetic the Finances tab renders — both read
 * `shared/reporting/ledger.ts` — so a briefing and a report cannot disagree.
 * `gaps` is the honest part: what the association has NOT recorded, printed
 * rather than quietly treated as zero.
 */
const props = defineProps<{
  intro: string;
  money?: any | null;
  savedAt?: string | null;
  cached?: boolean;
}>();

const paragraphs = computed(() =>
  (props.intro || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
);

const usd = (n: number) =>
  `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

const summary = computed(() => props.money?.summary ?? null);
const aging = computed(() => props.money?.aging ?? null);
const debtors = computed(() => (props.money?.topDebtors ?? []).slice(0, 3));
const categories = computed(() => (props.money?.topExpenseCategories ?? []).slice(0, 3));
const gaps = computed<string[]>(() => props.money?.gaps ?? []);

const figures = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    { label: "Collected", value: usd(s.totalIncome) },
    { label: "Spent", value: usd(s.totalExpense) },
    { label: "Balance", value: usd(s.closingBalance) },
    { label: "Outstanding", value: usd(aging.value?.outstanding ?? 0) },
  ];
});

/** When this briefing was written — a stale read is worse than a slow one. */
const savedLabel = computed(() => {
  if (!props.savedAt) return null;
  const t = new Date(props.savedAt).getTime();
  if (!isFinite(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
});
</script>

<template>
  <section class="ios-card p-5 sm:p-6" aria-label="Briefing">
    <div class="flex items-center gap-2 mb-3">
      <h2 class="t-overline">The briefing</h2>
      <span v-if="cached && savedLabel" class="text-[11px] t-text-muted">
        · written {{ savedLabel }}
      </span>
    </div>

    <div class="space-y-3">
      <p v-for="(p, i) in paragraphs" :key="i" class="text-sm t-text leading-relaxed">
        {{ p }}
      </p>
    </div>

    <!-- The figures the prose above is allowed to cite, and nothing else. -->
    <div v-if="figures.length" class="mt-5 pt-5 t-divider">
      <h3 class="t-overline mb-3">The position</h3>
      <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div v-for="f in figures" :key="f.label">
          <dt class="text-[11px] t-text-muted">{{ f.label }}</dt>
          <dd class="text-base font-semibold t-text tabular-nums">{{ f.value }}</dd>
        </div>
      </dl>

      <div v-if="debtors.length || categories.length" class="grid gap-4 sm:grid-cols-2 mt-4">
        <div v-if="debtors.length">
          <h4 class="text-[11px] t-text-muted mb-1.5">Carrying the most</h4>
          <ul class="space-y-1">
            <li
              v-for="d in debtors"
              :key="d.memberId"
              class="flex items-center justify-between gap-3 text-sm"
            >
              <span class="t-text-secondary truncate">{{ d.memberName }}</span>
              <span class="t-text font-medium tabular-nums shrink-0">{{ usd(d.outstanding) }}</span>
            </li>
          </ul>
        </div>
        <div v-if="categories.length">
          <h4 class="text-[11px] t-text-muted mb-1.5">Where it goes</h4>
          <ul class="space-y-1">
            <li
              v-for="c in categories"
              :key="c.category"
              class="flex items-center justify-between gap-3 text-sm"
            >
              <span class="t-text-secondary truncate">{{ c.category }}</span>
              <span class="t-text font-medium tabular-nums shrink-0">{{ usd(c.total) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Not decoration: a figure the association has never recorded is a fact
           about the association, and printing it is what stops the briefing
           from quietly reading a gap as a zero. -->
      <p
        v-if="gaps.length"
        class="mt-4 text-xs t-text-muted flex items-start gap-2"
      >
        <Icon name="i-lucide-info" class="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>Not on record: {{ gaps.join(" · ") }}</span>
      </p>
    </div>
  </section>
</template>
