<script setup lang="ts">
// The block-builder's AI wizard: a brief in → a structured, block-mapped email
// out. Streams nothing (one structured JSON round); on success it emits the
// subject/previewText + the sections for the canvas. Metered server-side.
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { AiGeneratedSection } from "#core/shared/email/blocks";

const props = defineProps<{ orgId: string | null | undefined }>();
const emit = defineEmits<{
  (e: "apply", payload: { subject: string; previewText: string; sections: AiGeneratedSection[] }): void;
}>();

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
    toast.error("Describe the email you'd like");
    return;
  }
  if (!props.orgId) return;
  generating.value = true;
  try {
    const res = await $fetch<{
      subject: string;
      previewText: string;
      sections: AiGeneratedSection[];
      credits: number;
    }>("/api/email/ai-generate", {
      method: "POST",
      body: { orgId: props.orgId, brief: text },
    });
    if (!res.sections?.length) {
      toast.error("The AI couldn't map that to blocks — try rephrasing.");
      return;
    }
    emit("apply", { subject: res.subject, previewText: res.previewText, sections: res.sections });
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
          Generate email with AI
        </DialogTitle>
        <DialogDescription>
          Describe the message. AI drafts a full layout from your blocks — you can tweak every part after.
        </DialogDescription>
      </DialogHeader>

      <Textarea
        v-model="brief"
        rows="5"
        :disabled="generating"
        placeholder="e.g. A spring newsletter: pool opens May 15, remind owners about quarterly dues due April 1, and welcome three new residents."
        @keydown.meta.enter="generate"
      />

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
          {{ generating ? "Generating…" : "Generate" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
