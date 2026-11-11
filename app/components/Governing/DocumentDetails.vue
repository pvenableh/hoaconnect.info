<script setup lang="ts">
// Governing documents: a document's own details (title, kind, recording
// data). People who manage governing documents edit them here; the server
// checks again, never touches a provision, and writes the audit row with the
// fields before and after. A published document's details need a reason.
import { toast } from "vue-sonner";
import { kindLabel } from "#core/shared/governing/labels";
import { DOCUMENT_KINDS, type DocumentEdit } from "#core/shared/governing/review";

const props = defineProps<{
  document: { id: string; status: string } & Record<string, unknown>;
  orgId: string | null | undefined;
}>();
const emit = defineEmits<{ saved: [] }>();

const { editDocument } = useGoverningDocs(toRef(props, "orgId"));

const TEXT = ["title", "citation_prefix", "or_book", "clerk_file_no", "county"] as const;
const DATES = ["executed_on", "recorded_on"] as const;
const NUMBERS = ["or_page_start", "or_page_end"] as const;
type Field = "kind" | (typeof TEXT)[number] | (typeof DATES)[number] | (typeof NUMBERS)[number];

// Everything is held as the text the boxes show; a date keeps its day only.
const stored = (field: Field): string => {
  const value = props.document[field];
  if (value == null) return "";
  return (DATES as readonly string[]).includes(field) ? String(value).slice(0, 10) : String(value);
};
const FIELDS: Field[] = ["kind", ...TEXT, ...DATES, ...NUMBERS];
const blank = () => Object.fromEntries(FIELDS.map((f) => [f, stored(f)])) as Record<Field, string>;
const form = reactive(blank());
watch(() => props.document, () => Object.assign(form, blank()));

const published = computed(() => props.document.status !== "draft" && props.document.status !== "in_review");
const reason = ref("");
const changed = computed(() => FIELDS.filter((f) => String(form[f] ?? "").trim() !== stored(f)));
const saving = ref(false);

const save = async () => {
  if (saving.value || !changed.value.length) return;
  const edit: Record<string, unknown> = {};
  for (const field of changed.value) {
    const value = String(form[field] ?? "").trim();
    if ((NUMBERS as readonly string[]).includes(field)) edit[field] = value ? Number(value) : null;
    else if (field === "kind") edit[field] = value;
    else edit[field] = value || null;
  }
  saving.value = true;
  try {
    await editDocument(props.document.id, edit as DocumentEdit, reason.value.trim() || undefined);
    toast.success("Details saved");
    reason.value = "";
    emit("saved");
  } catch (error: any) {
    toast.error(error?.data?.message || "Could not save the details.");
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <details class="ios-card p-4" data-testid="governing-document-details">
    <summary class="type-body t-text cursor-pointer">Document details</summary>
    <form class="mt-4 space-y-3" @submit.prevent="save">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1 sm:col-span-2">
          <Label for="gov-doc-title">Title</Label>
          <Input id="gov-doc-title" v-model="form.title" />
        </div>
        <div class="space-y-1">
          <Label for="gov-doc-kind">Kind of document</Label>
          <Select v-model="form.kind">
            <SelectTrigger id="gov-doc-kind"><SelectValue placeholder="Kind" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="k in DOCUMENT_KINDS" :key="k" :value="k">{{ kindLabel(k) }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-1">
          <Label for="gov-doc-prefix">Citation prefix</Label>
          <Input id="gov-doc-prefix" v-model="form.citation_prefix" placeholder="By-Law" />
        </div>
        <div class="space-y-1">
          <Label for="gov-doc-executed">Signed on</Label>
          <DateInput id="gov-doc-executed" v-model="form.executed_on" />
        </div>
        <div class="space-y-1">
          <Label for="gov-doc-recorded">Recorded on</Label>
          <DateInput id="gov-doc-recorded" v-model="form.recorded_on" />
        </div>
        <div class="space-y-1">
          <Label for="gov-doc-book">Official Records book</Label>
          <Input id="gov-doc-book" v-model="form.or_book" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label for="gov-doc-page-start">First page</Label>
            <Input id="gov-doc-page-start" v-model="form.or_page_start" type="number" min="1" inputmode="numeric" />
          </div>
          <div class="space-y-1">
            <Label for="gov-doc-page-end">Last page</Label>
            <Input id="gov-doc-page-end" v-model="form.or_page_end" type="number" min="1" inputmode="numeric" />
          </div>
        </div>
        <div class="space-y-1">
          <Label for="gov-doc-clerk">Clerk's file number</Label>
          <Input id="gov-doc-clerk" v-model="form.clerk_file_no" />
        </div>
        <div class="space-y-1">
          <Label for="gov-doc-county">County</Label>
          <Input id="gov-doc-county" v-model="form.county" />
        </div>
        <div v-if="published" class="space-y-1 sm:col-span-2">
          <Label for="gov-doc-reason">Reason for the change</Label>
          <Input id="gov-doc-reason" v-model="reason" placeholder="For example, the recorded date was mistyped" />
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <span v-if="published && changed.length && !reason.trim()" class="type-meta t-text-muted">Give a reason to save.</span>
        <Button type="submit" size="sm" :disabled="saving || !changed.length || !String(form.title ?? '').trim() || (published && !reason.trim())">
          Save Details
        </Button>
      </div>
    </form>
  </details>
</template>
