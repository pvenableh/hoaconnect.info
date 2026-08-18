<script setup lang="ts">
// The landing builder's AI wizard: a brief about the building in → a structured,
// block-mapped landing out (hero copy, About narrative, content sections, FAQ,
// location). Grounded server-side in the org's real data. Mirrors the email
// builder's wizard; metered server-side. Applying replaces the canvas, so when
// the canvas already has content we make that explicit before generating.
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { AiLandingResult } from "#core/shared/landing/ai";

const props = defineProps<{ orgId: string | null | undefined; hasContent: boolean }>();
const emit = defineEmits<{ (e: "apply", result: AiLandingResult): void }>();

const open = defineModel<boolean>("open", { default: false });

const orgIdRef = toRef(props, "orgId");
const { summary, refresh } = useAiCredits(orgIdRef);
onMounted(refresh);

const brief = ref("");
const generating = ref(false);
const formatCredits = (n: number) => n.toLocaleString();

async function generate() {
  const text = brief.value.trim();
  if (!text) {
    toast.error("Describe your community");
    return;
  }
  if (!props.orgId) return;
  generating.value = true;
  try {
    const res = await $fetch<{ result: AiLandingResult; credits: number }>("/api/landing/ai-generate", {
      method: "POST",
      body: { orgId: props.orgId, brief: text },
    });
    if (!res.result?.sections?.length) {
      toast.error("The AI couldn't draft that — try adding a little more detail.");
      return;
    }
    emit("apply", res.result);
    open.value = false;
    brief.value = "";
    toast.success(res.credits > 0 ? `Draft ready — used ~${formatCredits(res.credits)} credits` : "Draft ready");
    await refresh();
  } catch (err: any) {
    if (err?.status === 402 || err?.data?.error === "insufficient_credits") {
      toast.error("You're out of AI credits — top up to keep drafting");
    } else if (err?.status === 503) {
      toast.error("AI isn't configured yet");
    } else {
      toast.error(err?.data?.message || err?.message || "Generation failed");
    }
  } finally {
    generating.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Icon name="lucide:sparkles" class="w-4 h-4 text-primary" />
          Generate your site with AI
        </DialogTitle>
        <DialogDescription>
          Describe your community in a sentence or two. AI drafts a full page — hero, About, sections,
          FAQ — grounded in your real amenities, board, and location. Refine everything after.
        </DialogDescription>
      </DialogHeader>

      <Textarea
        v-model="brief"
        rows="5"
        :disabled="generating"
        placeholder="e.g. A boutique 28-unit condo in South Beach, a block from the ocean, recently renovated, pet-friendly, professionally managed."
        @keydown.meta.enter="generate"
      />

      <div
        v-if="hasContent"
        class="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 text-amber-800 text-xs px-3 py-2 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200"
      >
        <Icon name="lucide:triangle-alert" class="w-4 h-4 shrink-0 mt-px" />
        <span>This replaces your current sections with the AI draft. Your saved page isn't changed until you press Save.</span>
      </div>

      <DialogFooter class="gap-2 sm:gap-0">
        <span v-if="summary" class="mr-auto text-xs t-text-muted self-center">
          {{ formatCredits(summary.balanceCredits) }} credits available
        </span>
        <Button type="button" variant="ghost" :disabled="generating" @click="open = false">Cancel</Button>
        <Button type="button" :disabled="generating" @click="generate">
          <Icon
            :name="generating ? 'lucide:loader-circle' : 'lucide:sparkles'"
            class="w-4 h-4 mr-1.5"
            :class="{ 'animate-spin': generating }"
          />
          {{ generating ? "Generating…" : hasContent ? "Replace with AI draft" : "Generate" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
