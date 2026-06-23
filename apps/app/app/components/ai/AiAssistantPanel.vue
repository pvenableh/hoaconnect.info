<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Slide-over AI assistant — an ambient surface over the current page (mirrors
// the Channels panel). Read-only: it answers org-aware questions and drafts
// communications; it never takes actions. Mounted once in auth.vue.
const { isOpen, activeConversationId, close, setConversation } = useAiAssistant();

// Synchronous selected-org state (same source the dashboard/composer use).
const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
const orgId = computed(() => selectedOrgId.value);

const chat = useAiChat(orgId);
const { summary, refresh: refreshCredits, buyPack } = useAiCredits(orgId);
const route = useRoute();

const view = ref<"chat" | "list">("chat");
const input = ref("");
const scroller = ref<HTMLElement | null>(null);
const formatCredits = (n: number) => n.toLocaleString();

const TIERS = [
  { value: "fast", label: "Quick", hint: "Fast answers" },
  { value: "standard", label: "Deep", hint: "Careful analysis of docs & rules" },
] as const;

// Starter prompts, grounded in this org's real content (a real indexed document,
// a governing rule, the latest announcement) — fetched on open. The chips double
// as the capability hint: clicking one lands on actual data, teaching that the
// assistant reads the association's documents. Falls back to a static set.
const FALLBACK_SUGGESTIONS = [
  "What's the latest announcement?",
  "When is the next board meeting?",
  "Draft a notice about upcoming maintenance",
];
const suggestions = ref<string[]>([...FALLBACK_SUGGESTIONS]);

async function loadSuggestions() {
  if (!orgId.value) return;
  try {
    const res = await $fetch<{ suggestions: string[] }>("/api/ai/suggestions", {
      query: { orgId: orgId.value },
    });
    if (res?.suggestions?.length) suggestions.value = res.suggestions;
  } catch {
    /* keep the fallback set */
  }
}

// Split assistant text into plain + citation segments so [Title §section] tokens
// (the model is told to cite that way) render as visible source chips inline.
type Segment = { type: "text" | "cite"; value: string };
function citationSegments(content: string): Segment[] {
  const re = /\[([^\]\n]{2,90})\]/g;
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    // Only treat a bracketed token as a citation if it contains a letter.
    if (!/[A-Za-z]/.test(m[1]!)) continue;
    if (m.index > last) out.push({ type: "text", value: content.slice(last, m.index) });
    out.push({ type: "cite", value: m[1]!.trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) out.push({ type: "text", value: content.slice(last) });
  return out;
}

function scrollToBottom() {
  nextTick(() => {
    const el = scroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}
watch(() => chat.messages.value.length, scrollToBottom);
watch(
  () => chat.messages.value[chat.messages.value.length - 1]?.content,
  scrollToBottom
);

// When opened (optionally on a specific conversation), prepare state.
watch(
  isOpen,
  async (open) => {
    if (!open) return;
    refreshCredits();
    loadSuggestions();
    chat.fetchConversations();
    if (activeConversationId.value && activeConversationId.value !== chat.conversationId.value) {
      await chat.loadConversation(activeConversationId.value);
    }
    view.value = "chat";
    scrollToBottom();
  }
);

async function onSend() {
  const text = input.value.trim();
  if (!text || chat.isStreaming.value || !orgId.value) return;
  input.value = "";
  view.value = "chat";
  try {
    await chat.send(text);
    await refreshCredits();
  } catch (err: any) {
    if (err?.status === 402) {
      toast.error("You're out of AI credits — top up to keep chatting");
      showBuy.value = true;
    } else if (err?.status === 503) {
      toast.error("AI isn't configured yet");
    } else {
      toast.error(err?.message || "Message failed");
    }
  }
}

function ask(suggestion: string) {
  input.value = suggestion;
  onSend();
}

function newChat() {
  chat.reset();
  setConversation(null);
  view.value = "chat";
  input.value = "";
}

async function openConversation(id: string) {
  setConversation(id);
  await chat.loadConversation(id);
  view.value = "chat";
  scrollToBottom();
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

// ── Buy-credits dialog (reuses the composer's pattern) ──
const showBuy = ref(false);
const buying = ref<string | null>(null);
async function purchase(packId: string) {
  buying.value = packId;
  try {
    await buyPack(packId, route.path);
  } catch (err: any) {
    toast.error(err?.message || "Could not start checkout");
    buying.value = null;
  }
}

// Esc closes the panel.
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && isOpen.value) close();
};
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="isOpen" class="fixed inset-0 z-[60]" role="dialog" aria-label="AI assistant">
        <!-- Themed backdrop -->
        <div class="absolute inset-0 t-scrim" @click="close" />

        <!-- Drawer -->
        <Transition
          enter-active-class="transition-transform duration-250 ease-out"
          leave-active-class="transition-transform duration-200 ease-in"
          enter-from-class="translate-x-full"
          leave-to-class="translate-x-full"
          appear
        >
          <aside
            v-if="isOpen"
            class="absolute top-0 right-0 h-full w-full sm:w-[440px] md:w-[560px] t-bg-elevated shadow-2xl flex flex-col"
          >
            <!-- Header -->
            <div class="flex items-center justify-between px-4 h-14 border-b t-border shrink-0">
              <div class="flex items-center gap-2 min-w-0">
                <button
                  v-if="view === 'list'"
                  class="header-pill"
                  title="Back to chat"
                  @click="view = 'chat'"
                >
                  <Icon name="lucide:chevron-left" class="w-4 h-4" />
                </button>
                <span class="t-icon-chip"><Icon name="lucide:sparkles" class="w-4 h-4" /></span>
                <span class="font-semibold truncate t-text">Assistant</span>
              </div>
              <div class="flex items-center gap-1.5">
                <!-- Wallet meter -->
                <button
                  v-if="summary && summary.aiConfigured"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                  :class="summary.lowBalance ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 't-bg-subtle t-text-secondary hover:t-bg'"
                  :title="`${formatCredits(summary.balanceCredits)} AI credits`"
                  @click="showBuy = true"
                >
                  <Icon name="i-lucide-sparkles" class="w-3.5 h-3.5" />
                  {{ formatCredits(summary.balanceCredits) }}
                </button>
                <button class="header-pill" title="New chat" @click="newChat">
                  <Icon name="lucide:plus" class="w-4 h-4" />
                </button>
                <button class="header-pill" title="History" @click="view = view === 'list' ? 'chat' : 'list'">
                  <Icon name="lucide:history" class="w-4 h-4" />
                </button>
                <button class="header-pill" title="Close" @click="close">
                  <Icon name="lucide:x" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Body — cross-fades between the configured states (chat ↔ history). -->
            <Transition name="ai-view" mode="out-in">
            <!-- Not configured -->
            <div
              v-if="summary && !summary.aiConfigured"
              key="unconfigured"
              class="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center"
            >
              <Icon name="lucide:sparkles" class="w-8 h-8 t-text-muted" />
              <p class="t-text font-medium">The assistant isn't configured yet</p>
              <p class="text-sm t-text-muted">An AI key needs to be set up for this environment.</p>
            </div>

            <!-- Conversation list -->
            <div v-else-if="view === 'list'" key="list" class="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
              <button
                class="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm t-text hover:t-bg-subtle"
                @click="newChat"
              >
                <span class="t-icon-chip"><Icon name="lucide:plus" class="w-4 h-4" /></span>
                New conversation
              </button>
              <div v-if="!chat.conversations.value.length" class="px-3 py-6 text-center text-sm t-text-muted">
                No past conversations yet.
              </div>
              <button
                v-for="c in chat.conversations.value"
                :key="c.id"
                class="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:t-bg-subtle"
                :class="c.id === chat.conversationId.value ? 't-bg-subtle' : ''"
                @click="openConversation(c.id)"
              >
                <span class="truncate text-sm t-text">{{ c.title || "Untitled" }}</span>
                <span class="shrink-0 text-xs t-text-muted">{{ fmtDate(c.date_updated) }}</span>
              </button>
            </div>

            <!-- Chat thread -->
            <div v-else key="chat" class="flex-1 min-h-0 flex flex-col">
              <div ref="scroller" class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                <!-- Empty state -->
                <div v-if="!chat.messages.value.length" class="h-full flex flex-col items-center justify-center text-center gap-4">
                  <span class="t-icon-chip !w-12 !h-12"><Icon name="lucide:sparkles" class="w-6 h-6" /></span>
                  <div>
                    <p class="t-text font-medium t-heading">How can I help?</p>
                    <p class="text-sm t-text-muted">Ask about your association — announcements, documents, rules, meetings — or have me draft something.</p>
                  </div>
                  <div class="flex flex-col gap-2 w-full max-w-xs">
                    <button
                      v-for="s in suggestions"
                      :key="s"
                      class="rounded-full border t-border px-3 py-1.5 text-sm t-text-secondary hover:t-bg-subtle"
                      @click="ask(s)"
                    >
                      {{ s }}
                    </button>
                  </div>
                </div>

                <!-- Messages -->
                <div
                  v-for="(m, i) in chat.messages.value"
                  :key="i"
                  class="flex"
                  :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                  <div
                    class="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words"
                    :class="m.role === 'user'
                      ? 'bg-[var(--theme-accent-primary)] text-white'
                      : 't-bg-subtle t-text'"
                  >
                    <template v-if="m.content">
                      <!-- User text stays plain; assistant text renders [Title §section]
                           citations as inline source chips so it visibly reads from docs. -->
                      <template v-if="m.role === 'assistant'">
                        <template v-for="(seg, si) in citationSegments(m.content)" :key="si">
                          <span
                            v-if="seg.type === 'cite'"
                            class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 mx-0.5 text-[11px] font-medium align-baseline t-bg-accent/15 t-text-accent"
                            :title="`Source: ${seg.value}`"
                          >
                            <Icon name="lucide:file-text" class="w-3 h-3 shrink-0" />{{ seg.value }}
                          </span>
                          <template v-else>{{ seg.value }}</template>
                        </template>
                      </template>
                      <template v-else>{{ m.content }}</template>
                    </template>
                    <span v-else-if="m.pending" class="inline-flex gap-1 items-center t-text-muted">
                      <span class="spinner-ios !w-4 !h-4" />
                    </span>
                  </div>
                </div>
              </div>

              <!-- Composer -->
              <div class="border-t t-border p-3 shrink-0 space-y-2">
                <div class="flex items-center gap-1 rounded-full t-bg-subtle p-1 w-fit">
                  <button
                    v-for="t in TIERS"
                    :key="t.value"
                    type="button"
                    class="px-3 py-1 text-xs rounded-full transition-colors"
                    :class="chat.tier.value === t.value ? 'bg-white shadow-sm t-text dark:bg-white/10' : 't-text-secondary hover:t-text'"
                    :title="t.hint"
                    @click="chat.tier.value = t.value"
                  >
                    {{ t.label }}
                  </button>
                </div>
                <div class="flex items-end gap-2">
                  <Textarea
                    v-model="input"
                    placeholder="Ask the assistant…"
                    rows="1"
                    class="resize-none max-h-32"
                    :disabled="chat.isStreaming.value"
                    @keydown.enter.exact.prevent="onSend"
                  />
                  <Button
                    type="button"
                    size="icon"
                    class="rounded-full shrink-0"
                    :disabled="chat.isStreaming.value || !input.trim()"
                    @click="onSend"
                  >
                    <Icon
                      :name="chat.isStreaming.value ? 'lucide:loader-circle' : 'lucide:arrow-up'"
                      class="w-4 h-4"
                      :class="{ 'animate-spin': chat.isStreaming.value }"
                    />
                  </Button>
                </div>
                <p class="text-[11px] t-text-muted text-center">
                  The assistant can be wrong — review drafts before sending. It can't take actions.
                </p>
              </div>
            </div>
            </Transition>

            <!-- Buy-credits dialog -->
            <Dialog v-model:open="showBuy">
              <DialogContent class="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Buy AI credits</DialogTitle>
                  <DialogDescription>
                    {{ summary ? formatCredits(summary.balanceCredits) : 0 }} credits remaining. Purchased credits never expire.
                  </DialogDescription>
                </DialogHeader>
                <div class="space-y-2">
                  <div
                    v-for="pack in summary?.packs || []"
                    :key="pack.id"
                    class="flex items-center justify-between rounded-lg border t-border px-4 py-3"
                  >
                    <div>
                      <div class="font-medium t-text">{{ pack.label }}</div>
                      <div class="text-xs t-text-muted">{{ formatCredits(pack.credits) }} credits</div>
                    </div>
                    <Button type="button" size="sm" :disabled="buying === pack.id" @click="purchase(pack.id)">
                      <Icon v-if="buying === pack.id" name="i-lucide-loader-circle" class="w-4 h-4 mr-1.5 animate-spin" />
                      ${{ pack.priceUsd }}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Cross-fade + gentle vertical drift between the panel's body states
   (chat ↔ history ↔ unconfigured). mode="out-in" so one settles before the
   next arrives. Honors reduced-motion. */
.ai-view-enter-active,
.ai-view-leave-active {
  transition: opacity 160ms ease, transform 200ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
.ai-view-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.ai-view-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .ai-view-enter-active,
  .ai-view-leave-active {
    transition: opacity 120ms ease;
  }
  .ai-view-enter-from,
  .ai-view-leave-to {
    transform: none;
  }
}
</style>
