<script setup lang="ts">
/**
 * "Ask the HOA" — the owner-facing question box.
 *
 * Sits above the ledger feed, where an owner already is when they have a
 * question about the community's record. Everything it renders comes from
 * `POST /api/ai/ask`, including the citations: the route returns them as
 * structured data precisely so this component never has to parse the model's
 * prose to find out what the answer leaned on.
 *
 * **The refusal is a first-class state, not an error.** When the community's
 * records don't answer the question, the route replies with `grounded: false`
 * and charges nothing — and this shows that reply plainly rather than dressing
 * it as a failure. A product whose promise is "cited from your own records" has
 * to be visibly comfortable saying "not in them".
 */

const props = defineProps<{ slug: string }>();

interface Citation {
  kind: "ledger";
  id: string;
  label: string;
  title: string;
  occurredAt: string;
}

interface AskResponse {
  answer: string;
  grounded: boolean;
  citations: Citation[];
  credits: number;
  balanceCredits: number;
}

const question = ref("");
const asking = ref(false);
const answer = ref<AskResponse | null>(null);
const error = ref<string | null>(null);

// The questions this actually answers well, so the first thing an owner sees is
// a working example rather than an empty box daring them to guess the format.
const EXAMPLES = [
  "When did the board change managers?",
  "What has the community spent money on?",
  "What did we decide about the lobby?",
];

const canAsk = computed(() => question.value.trim().length > 2 && !asking.value);

const ask = async (text?: string) => {
  const q = (text ?? question.value).trim();
  if (!q || asking.value) return;
  question.value = q;
  asking.value = true;
  error.value = null;
  answer.value = null;
  try {
    answer.value = await $fetch<AskResponse>("/api/ai/ask", {
      method: "POST",
      body: { slug: props.slug, question: q },
    });
  } catch (e: any) {
    const status = e?.statusCode ?? e?.response?.status;
    error.value =
      status === 402
        ? "This community is out of AI credits. An administrator can top them up."
        : status === 403
          ? "This community's records are for its members."
          : e?.data?.message || "That didn't work. Try again in a moment.";
  } finally {
    asking.value = false;
  }
};

const reset = () => {
  answer.value = null;
  error.value = null;
  question.value = "";
};
</script>

<template>
  <div class="rounded-xl border t-border overflow-hidden">
    <div class="p-4 sm:p-5">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full t-bg-accent/15 t-text-accent">
          <Icon name="i-lucide-sparkles" class="w-4 h-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="t-text font-medium">Ask your community</p>
          <p class="text-xs t-text-muted mt-0.5">
            Answered only from this community's documents and ledger, with the entries
            it used. If the records don't say, it will tell you that instead of guessing.
          </p>
        </div>
      </div>

      <form class="mt-3 flex items-center gap-2" @submit.prevent="ask()">
        <Input
          v-model="question"
          :disabled="asking"
          placeholder="e.g. When did the board change managers?"
          class="flex-1"
        />
        <Button type="submit" class="rounded-full shrink-0" :disabled="!canAsk">
          <Icon v-if="asking" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          <span v-else>Ask</span>
        </Button>
      </form>

      <div v-if="!answer && !asking && !error" class="mt-2.5 flex flex-wrap gap-1.5">
        <button
          v-for="ex in EXAMPLES"
          :key="ex"
          type="button"
          class="px-2.5 py-1 text-[11px] rounded-full t-bg-subtle t-text-secondary hover:t-bg transition-colors"
          @click="ask(ex)"
        >
          {{ ex }}
        </button>
      </div>
    </div>

    <div v-if="error" class="border-t t-border px-4 sm:px-5 py-3">
      <p class="text-sm t-text-secondary">{{ error }}</p>
    </div>

    <div v-else-if="answer" class="border-t t-border px-4 sm:px-5 py-4 space-y-3">
      <p class="text-sm t-text whitespace-pre-line">{{ answer.answer }}</p>

      <div v-if="answer.citations.length" class="space-y-1.5">
        <p class="text-[11px] uppercase tracking-ultra-wide t-text-muted">From the ledger</p>
        <ul class="space-y-1">
          <li v-for="c in answer.citations" :key="c.id">
            <NuxtLink
              :to="`/${props.slug}/ledger#entry-${c.id}`"
              class="text-xs t-text-secondary hover:t-text inline-flex items-center gap-1.5"
            >
              <Icon name="i-lucide-link" class="w-3 h-3 shrink-0" />
              <span class="font-medium">{{ c.title }}</span>
              <span class="t-text-muted">{{ c.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>

      <!-- No citations and not grounded: the honest "not in the records" case.
           Said out loud rather than left looking like an empty result. -->
      <p v-else-if="!answer.grounded" class="text-xs t-text-muted italic">
        Nothing in the community's records matched this question.
      </p>

      <button type="button" class="text-xs underline t-text-muted" @click="reset">
        Ask something else
      </button>
    </div>
  </div>
</template>
