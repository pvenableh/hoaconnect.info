<script setup lang="ts">
// Governing documents: the original files behind a transcription (the recorded
// scan, or another copy), each labelled, opened through the asset proxy, which
// checks the caller again. People who manage governing documents can attach
// and remove files when `documentId` is given with `canManage`.
import { toast } from "vue-sonner";
import type { GovSource } from "#core/shared/governing/types";
import { sourceLabels } from "#core/shared/governing/labels";

const props = defineProps<{
  sources: GovSource[];
  orgId: string | null | undefined;
  /** Shows the attach and remove controls. The server decides again on every call. */
  canManage?: boolean;
  documentId?: string;
}>();
const emit = defineEmits<{ changed: [] }>();

const { getAuthUrl } = useDirectusFiles();
const { formatFileSize } = useStorageFormat();
const { confirm } = useConfirm();
const { attachSource, removeSource } = useGoverningDocs(toRef(props, "orgId"));

// An admin previewing the member view sees the block as a member does.
const { isPreviewingMember } = useViewAs();
const manages = computed(() => !!props.canManage && !!props.documentId && !isPreviewingMember.value);

const detail = (source: GovSource) =>
  [
    source.page_count ? `${source.page_count} ${source.page_count === 1 ? "page" : "pages"}` : "",
    source.type === "application/pdf" ? "PDF" : source.type?.startsWith("image/") ? "Image" : "",
    source.filesize ? formatFileSize(source.filesize) : "",
  ]
    .filter(Boolean)
    .join(" · ");

// Attach form
const adding = ref(false);
const file = ref<File | null>(null);
const isRecordedCopy = ref(true);
const isAuthoritative = ref(false);
const notes = ref("");
const saving = ref(false);
const removing = ref<string | null>(null);

const reset = () => {
  adding.value = false;
  file.value = null;
  isRecordedCopy.value = true;
  isAuthoritative.value = false;
  notes.value = "";
};
const onFile = (event: Event) => {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
};
const message = (error: any, fallback: string) => error?.data?.message || error?.statusMessage || fallback;

const attach = async () => {
  if (!file.value || !props.documentId || saving.value) return;
  saving.value = true;
  try {
    await attachSource(props.documentId, file.value, {
      is_recorded_copy: isRecordedCopy.value,
      is_authoritative: isAuthoritative.value,
      notes: notes.value,
    });
    toast.success("Original document attached");
    reset();
    emit("changed");
  } catch (error) {
    toast.error(message(error, "Could not attach the file."));
  } finally {
    saving.value = false;
  }
};

const remove = async (source: GovSource) => {
  if (!props.documentId) return;
  const ok = await confirm({
    title: "Remove this original document?",
    body: `"${source.filename ?? "This file"}" is deleted. The transcribed text is not changed.`,
    confirmLabel: "Remove",
    destructive: true,
  });
  if (!ok) return;
  removing.value = source.id;
  try {
    await removeSource(props.documentId, source.id);
    toast.success("Original document removed");
    emit("changed");
  } catch (error) {
    toast.error(message(error, "Could not remove the file."));
  } finally {
    removing.value = null;
  }
};
</script>

<template>
  <section v-if="sources.length || manages" class="space-y-2" data-testid="governing-originals">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="type-section t-text">{{ sources.length > 1 ? "Original documents" : "Original document" }}</h2>
      <Button v-if="manages && !adding" variant="outline" size="sm" @click="adding = true">
        <Icon name="lucide:paperclip" class="w-4 h-4 mr-1.5" /> Attach Original
      </Button>
    </div>

    <ul v-if="sources.length" class="ios-card divide-y t-border">
      <li v-for="source in sources" :key="source.id" class="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div class="flex-1 min-w-0 space-y-1">
          <p class="type-body t-text break-words">{{ source.filename ?? "Original document" }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <Badge v-for="label in sourceLabels(source)" :key="label" variant="secondary">{{ label }}</Badge>
            <span v-if="detail(source)" class="type-meta t-text-muted">{{ detail(source) }}</span>
          </div>
          <p v-if="source.notes" class="type-meta t-text-secondary whitespace-pre-wrap">{{ source.notes }}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button as-child variant="outline" size="sm">
            <a :href="getAuthUrl(source.file) ?? undefined" target="_blank" rel="noopener">
              <Icon name="lucide:external-link" class="w-4 h-4 mr-1.5" /> Open
            </a>
          </Button>
          <Button as-child variant="ghost" size="sm">
            <a :href="getAuthUrl(source.file, { download: true }) ?? undefined" :download="source.filename ?? ''">
              <Icon name="lucide:download" class="w-4 h-4 mr-1.5" /> Download
            </a>
          </Button>
          <Button
            v-if="manages"
            variant="ghost"
            size="sm"
            :disabled="removing === source.id"
            :aria-label="`Remove ${source.filename ?? 'original document'}`"
            @click="remove(source)"
          >
            <Icon name="lucide:trash-2" class="w-4 h-4" />
          </Button>
        </div>
      </li>
    </ul>
    <AppEmptyState
      v-else-if="!adding"
      icon="lucide:file-scan"
      title="No original attached yet"
      description="Attach the recorded scan so members can compare it with the text."
      size="sm"
    />

    <form v-if="manages && adding" class="ios-card p-4 space-y-3" @submit.prevent="attach">
      <label class="w-full px-3 py-2 border t-border rounded-md type-meta cursor-pointer flex items-center gap-2 t-text-secondary hover:t-text">
        <Icon name="lucide:paperclip" class="w-4 h-4 shrink-0" />
        <span class="truncate">{{ file?.name ?? "Choose a PDF or an image…" }}</span>
        <input type="file" accept="application/pdf,image/*" class="hidden" data-testid="governing-original-file" @change="onFile" />
      </label>
      <label class="flex items-start gap-2 type-meta t-text-secondary">
        <Checkbox v-model="isRecordedCopy" class="mt-0.5" />
        <span>This is the copy recorded in the public records</span>
      </label>
      <label class="flex items-start gap-2 type-meta t-text-secondary">
        <Checkbox v-model="isAuthoritative" class="mt-0.5" />
        <span>The published text was taken from this copy</span>
      </label>
      <Input v-model="notes" placeholder="Notes (optional), e.g. where this copy came from" />
      <div class="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" :disabled="saving" @click="reset">Cancel</Button>
        <Button type="submit" :disabled="!file || saving">
          <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
          Attach
        </Button>
      </div>
    </form>
  </section>
</template>
