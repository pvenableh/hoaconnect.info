<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const props = defineProps<{ orgId: string | null | undefined }>();

// Two-way bound to the composer's subject + body.
const subject = defineModel<string>("subject", { default: "" });
const content = defineModel<string>("content", { default: "" });

const orgIdRef = toRef(props, "orgId");
const { summary, refresh, streamDraft, buyPack } = useAiCredits(orgIdRef);
const route = useRoute();

onMounted(refresh);
watch(orgIdRef, refresh);

// ── Draft prompt dialog ──
const showPrompt = ref(false);
const instruction = ref("");
const generating = ref(false);
const isRewrite = computed(() => !!(subject.value || content.value));

const formatCredits = (n: number) => n.toLocaleString();

async function generate() {
  const text = instruction.value.trim();
  if (!text) {
    toast.error("Describe what you'd like drafted");
    return;
  }
  generating.value = true;
  try {
    const { credits } = await streamDraft({
      instruction: text,
      subject: isRewrite.value ? subject.value : null,
      content: isRewrite.value ? content.value : null,
      onText: ({ subject: s, body }) => {
        if (s !== null) subject.value = s;
        content.value = body;
      },
    });
    showPrompt.value = false;
    instruction.value = "";
    toast.success(credits > 0 ? `Draft ready — used ~${formatCredits(credits)} credits` : "Draft ready");
  } catch (err: any) {
    if (err?.status === 402) {
      toast.error("You're out of AI credits — top up to keep drafting");
      showPrompt.value = false;
      showBuy.value = true;
    } else if (err?.status === 503) {
      toast.error("AI isn't configured yet");
    } else {
      toast.error(err?.message || "Draft failed");
    }
  } finally {
    generating.value = false;
  }
}

// ── Buy-credits dialog ──
const showBuy = ref(false);
const buying = ref<string | null>(null);
async function purchase(packId: string) {
  buying.value = packId;
  try {
    await buyPack(packId, route.path);
    // buyPack redirects to Stripe; if it returns we failed to get a URL.
  } catch (err: any) {
    toast.error(err?.message || "Could not start checkout");
    buying.value = null;
  }
}
</script>

<template>
  <!-- Only render once we know the org has a wallet and AI is configured. -->
  <div v-if="summary && summary.aiConfigured" class="flex items-center gap-2 flex-wrap">
    <Button type="button" variant="outline" size="sm" @click="showPrompt = true">
      <Icon name="i-lucide-sparkles" class="w-4 h-4 mr-1.5" />
      {{ isRewrite ? "Rewrite with AI" : "Draft with AI" }}
    </Button>

    <!-- Wallet meter -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
      :class="summary.lowBalance ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 't-bg-subtle t-text-secondary hover:t-bg'"
      :title="`${formatCredits(summary.balanceCredits)} AI credits`"
      @click="showBuy = true"
    >
      <Icon name="i-lucide-sparkles" class="w-3.5 h-3.5" />
      {{ formatCredits(summary.balanceCredits) }}
      <span class="opacity-70">credits</span>
      <Icon v-if="summary.lowBalance" name="i-lucide-plus" class="w-3.5 h-3.5" />
    </button>

    <!-- Prompt dialog -->
    <Dialog v-model:open="showPrompt">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ isRewrite ? "Rewrite with AI" : "Draft with AI" }}</DialogTitle>
          <DialogDescription>
            Describe the message. AI fills in the subject and body — review before sending.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          v-model="instruction"
          :placeholder="isRewrite
            ? 'e.g. Make it warmer and shorter; emphasize the new deadline'
            : 'e.g. Announce the pool will be closed this weekend for resurfacing'"
          rows="4"
          :disabled="generating"
          @keydown.meta.enter="generate"
        />

        <DialogFooter class="gap-2 sm:gap-0">
          <span class="mr-auto text-xs t-text-muted self-center">
            {{ formatCredits(summary.balanceCredits) }} credits available
          </span>
          <Button type="button" variant="ghost" :disabled="generating" @click="showPrompt = false">
            Cancel
          </Button>
          <Button type="button" :disabled="generating" @click="generate">
            <Icon
              :name="generating ? 'i-lucide-loader-circle' : 'i-lucide-sparkles'"
              class="w-4 h-4 mr-1.5"
              :class="{ 'animate-spin': generating }"
            />
            {{ generating ? "Drafting…" : "Generate" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Buy-credits dialog -->
    <Dialog v-model:open="showBuy">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buy AI credits</DialogTitle>
          <DialogDescription>
            {{ formatCredits(summary.balanceCredits) }} credits remaining. Purchased credits never expire.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-2">
          <div
            v-for="pack in summary.packs"
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
  </div>
</template>
