<script setup lang="ts">
// The email block-builder — sidebar palette + drag-drop canvas + AI wizard.
// Authoring-only: it emits the live assembled MJML (v-model:mjml) which the host
// composer writes into the email body, so the existing send/preview pipeline
// delivers it unchanged. The host previews via its own MJML preview.
const props = defineProps<{ orgId: string | null | undefined }>();
const emit = defineEmits<{ (e: "update:subject", value: string): void }>();

// v-model:mjml — the assembled document the host stores as the email content.
const mjmlOut = defineModel<string>("mjml", { default: "" });

const orgIdRef = toRef(props, "orgId");
const builder = useEmailBuilder(orgIdRef);

onMounted(() => builder.loadLibrary());
watch(orgIdRef, () => builder.loadLibrary());

// Push assembled MJML up whenever the canvas changes (empty canvas → empty body,
// so switching to the builder with no blocks doesn't clobber existing content).
watch(
  builder.mjml,
  (v) => {
    mjmlOut.value = builder.isEmpty.value ? "" : v;
  },
  { immediate: false }
);

const showWizard = ref(false);
function onAiApply(payload: { subject: string; previewText: string; sections: any[] }) {
  builder.populateFromAI(payload.sections);
  if (payload.subject) emit("update:subject", payload.subject);
}
</script>

<template>
  <div class="rounded-xl border t-border overflow-hidden">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-2 px-3 py-2 border-b t-border t-bg-subtle/50">
      <span class="text-xs font-medium t-text-secondary flex items-center gap-1.5">
        <Icon name="lucide:layout-template" class="w-3.5 h-3.5" />
        {{ builder.canvas.value.length }} block{{ builder.canvas.value.length === 1 ? "" : "s" }}
      </span>
      <div class="flex items-center gap-1.5">
        <Button
          v-if="builder.canvas.value.length"
          type="button"
          variant="ghost"
          size="sm"
          class="text-xs"
          @click="builder.clear()"
        >
          <Icon name="lucide:eraser" class="w-3.5 h-3.5 mr-1" />
          Clear
        </Button>
        <Button type="button" variant="outline" size="sm" @click="showWizard = true">
          <Icon name="lucide:sparkles" class="w-3.5 h-3.5 mr-1.5" />
          Generate with AI
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-[240px_1fr]">
      <!-- Palette -->
      <div class="border-b sm:border-b-0 sm:border-r t-border max-h-[520px] sm:max-h-[640px]">
        <EmailBuilderSidebar :library="builder.library.value" :loading="builder.loadingLibrary.value" @add="builder.addBlock($event)" />
      </div>

      <!-- Canvas -->
      <div class="p-3 t-bg-subtle/30 max-h-[520px] sm:max-h-[640px] overflow-y-auto">
        <EmailBuilderCanvas
          :blocks="builder.canvas.value"
          @remove="builder.removeBlock($event)"
          @move="builder.moveBlock($event.id, $event.direction)"
          @duplicate="builder.duplicateBlock($event)"
          @update-vars="builder.updateVariables($event.id, $event.vars)"
          @reorder="builder.setOrder($event)"
        />
      </div>
    </div>

    <EmailBuilderAiWizard v-model:open="showWizard" :org-id="orgId" @apply="onAiApply" />
  </div>
</template>
