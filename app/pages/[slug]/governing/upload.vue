<script setup lang="ts">
// Governing documents: upload a PDF or an image as a new draft document
// (Session 3A). The file is stored as it is; the draft, its pages and its text
// stay hidden from members until the document is reviewed and published.
import { toast } from "vue-sonner";
import { kindLabel } from "#core/shared/governing/labels";
import { DOCUMENT_KINDS, UPLOAD_MAX_BYTES } from "#core/shared/governing/upload";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { listDocuments, createFromUpload } = useGoverningDocs(selectedOrgId);
const { formatFileSize } = useStorageFormat();

// Only people who manage governing documents may upload; the server refuses anyone else.
const { data, status } = await useAsyncData(
  "governing-upload-access",
  async () => (selectedOrgId.value ? await listDocuments() : null),
  { watch: [selectedOrgId], server: false }
);
const waiting = computed(() => status.value === "idle" || (status.value === "pending" && !data.value));
const canManage = computed(() => data.value?.can_manage === true);

const title = ref("");
const kind = ref<string>("other");
const file = ref<File | null>(null);
const isRecordedCopy = ref(true);
const saving = ref(false);
const progress = ref<{ sent: number; total: number } | null>(null);

const tooLarge = computed(() => (file.value?.size ?? 0) > UPLOAD_MAX_BYTES);
const onFile = (event: Event) => {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
  // A starting point only: the file's name without its extension.
  if (file.value && !title.value.trim()) title.value = file.value.name.replace(/\.[^.]+$/, "");
};

const submit = async () => {
  if (!file.value || !title.value.trim() || tooLarge.value || saving.value) return;
  saving.value = true;
  progress.value = null;
  try {
    const created = await createFromUpload(
      { title: title.value, kind: kind.value, file: file.value, is_recorded_copy: isRecordedCopy.value },
      (sent, total) => (progress.value = { sent, total })
    );
    toast.success("Draft created");
    await navigateTo(buildOrgPath(`/governing/${created.id}`));
  } catch (error: any) {
    toast.error(error?.data?.message || "Could not upload the file.");
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <AppPageHeader
        eyebrow="Governing documents"
        title="Upload a document"
        description="Start a draft from a PDF or an image of the document as recorded."
        :back-to="buildOrgPath('/governing')"
        back-label="Governing documents"
      />

      <div v-if="waiting" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <AppEmptyState
        v-else-if="!canManage"
        icon="lucide:lock"
        title="Only the board and administrators can upload"
        description="Published governing documents are on the list."
      />

      <form v-else class="ios-card p-4 space-y-4" @submit.prevent="submit">
        <label class="w-full px-3 py-2 border t-border rounded-md type-meta cursor-pointer flex items-center gap-2 t-text-secondary hover:t-text">
          <Icon name="lucide:paperclip" class="w-4 h-4 shrink-0" />
          <span class="truncate flex-1">{{ file?.name ?? "Choose a PDF or an image…" }}</span>
          <span v-if="file" class="t-text-muted shrink-0">{{ formatFileSize(file.size) }}</span>
          <input type="file" accept="application/pdf,image/*" class="hidden" data-testid="governing-upload-file" @change="onFile" />
        </label>
        <p v-if="tooLarge" class="type-meta text-destructive" role="alert">
          That file is larger than {{ formatFileSize(UPLOAD_MAX_BYTES) }}. Split it into parts and upload each as its own original.
        </p>

        <div class="space-y-1.5">
          <Label for="governing-upload-title">Title</Label>
          <Input id="governing-upload-title" v-model="title" placeholder="For example, Amendment to the Declaration (1995)" />
        </div>

        <div class="space-y-1.5">
          <Label for="governing-upload-kind">Kind of document</Label>
          <Select v-model="kind">
            <SelectTrigger id="governing-upload-kind" class="w-full sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="k in DOCUMENT_KINDS" :key="k" :value="k">{{ kindLabel(k) }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <label class="flex items-start gap-2 type-meta t-text-secondary">
          <Checkbox v-model="isRecordedCopy" class="mt-0.5" />
          <span>This is the copy recorded in the public records</span>
        </label>

        <p class="type-meta t-text-muted">
          The file is kept exactly as it is. The document starts as a draft: members see nothing of it until its text has been reviewed and it is published.
        </p>

        <div class="flex flex-wrap items-center justify-end gap-3">
          <span v-if="saving && progress" class="type-meta t-text-secondary" role="status">
            Uploading part {{ progress.sent }} of {{ progress.total }}
          </span>
          <Button as-child type="button" variant="ghost">
            <NuxtLink :to="buildOrgPath('/governing')">Cancel</NuxtLink>
          </Button>
          <Button type="submit" :disabled="!file || !title.trim() || tooLarge || saving">
            <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            Upload as Draft
          </Button>
        </div>
      </form>
    </PageContainer>
  </div>
</template>
