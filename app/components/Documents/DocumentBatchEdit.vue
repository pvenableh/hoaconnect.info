<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HoaDocumentCategory } from "~~/types/directus";

interface SelectedDocument {
  id: string;
  title: string;
  document_category?: { id: string; name: string } | null;
  date_published?: string | null;
}

interface Props {
  open: boolean;
  documents: SelectedDocument[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "saved"): void;
}>();

const { update: updateDocument } = useDirectusItems("hoa_documents");
const { list: listCategories } = useDirectusItems("hoa_document_categories");
const { selectedOrgId } = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);

// Form state
const title = ref("");
const selectedCategory = ref<string>("");
const datePublished = ref<string>("");
const saving = ref(false);

// Track which fields have been modified
const titleModified = ref(false);
const categoryModified = ref(false);
const dateModified = ref(false);

// Categories
const documentCategories = ref<HoaDocumentCategory[]>([]);

// Computed
const isSingleDocument = computed(() => props.documents.length === 1);
const dialogOpen = computed({
  get: () => props.open,
  set: (value) => emit("update:open", value),
});

// Load categories
const loadCategories = async () => {
  if (!orgId.value) return;
  try {
    const result = await listCategories({
      fields: ["id", "name", "slug", "icon"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "published" },
      },
      sort: ["sort", "name"],
    });
    documentCategories.value = (result || []) as HoaDocumentCategory[];
  } catch (error) {
    console.error("Failed to load categories:", error);
  }
};

// Initialize form when dialog opens or documents change
watch(
  [() => props.open, () => props.documents],
  async ([open, docs]) => {
    if (open && docs.length > 0) {
      await loadCategories();

      // Reset modification tracking
      titleModified.value = false;
      categoryModified.value = false;
      dateModified.value = false;

      if (docs.length === 1) {
        // Single document - populate with existing values
        const doc = docs[0];
        title.value = doc.title || "";
        selectedCategory.value = doc.document_category?.id || "";
        datePublished.value = doc.date_published
          ? doc.date_published.split("T")[0]
          : "";
      } else {
        // Multiple documents - check for common values
        title.value = "";

        // Check if all docs have the same category
        const categories = docs.map((d) => d.document_category?.id || "");
        const uniqueCategories = [...new Set(categories)];
        selectedCategory.value =
          uniqueCategories.length === 1 ? uniqueCategories[0] : "";

        // Check if all docs have the same date
        const dates = docs.map((d) =>
          d.date_published ? d.date_published.split("T")[0] : ""
        );
        const uniqueDates = [...new Set(dates)];
        datePublished.value = uniqueDates.length === 1 ? uniqueDates[0] : "";
      }
    }
  },
  { immediate: true }
);

// Save changes
const save = async () => {
  saving.value = true;

  try {
    const updates: Record<string, any> = {};

    // Only include fields that were modified
    if (isSingleDocument.value && titleModified.value && title.value.trim()) {
      updates.title = title.value.trim();
    }

    if (categoryModified.value) {
      updates.document_category = selectedCategory.value || null;
    }

    if (dateModified.value) {
      updates.date_published = datePublished.value
        ? new Date(datePublished.value).toISOString()
        : null;
    }

    // Only proceed if there are changes
    if (Object.keys(updates).length === 0) {
      toast.info("No changes to save");
      dialogOpen.value = false;
      return;
    }

    // Update all selected documents
    await Promise.all(
      props.documents.map((doc) => updateDocument(doc.id, updates))
    );

    const count = props.documents.length;
    toast.success(
      count === 1
        ? "Document updated successfully"
        : `${count} documents updated successfully`
    );

    emit("saved");
    dialogOpen.value = false;
  } catch (error) {
    console.error("Failed to update documents:", error);
    toast.error("Failed to update documents");
  } finally {
    saving.value = false;
  }
};

// Track field modifications
const onTitleChange = () => {
  titleModified.value = true;
};

const onCategoryChange = () => {
  categoryModified.value = true;
};

const onDateChange = () => {
  dateModified.value = true;
};
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>
          {{
            isSingleDocument
              ? "Edit Document"
              : `Edit ${documents.length} Documents`
          }}
        </DialogTitle>
        <DialogDescription>
          {{
            isSingleDocument
              ? "Update the document metadata below."
              : "Changes will be applied to all selected documents. Only modified fields will be updated."
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- Title (only for single document) -->
        <div v-if="isSingleDocument" class="grid gap-2">
          <Label for="edit-title">Title</Label>
          <Input
            id="edit-title"
            v-model="title"
            placeholder="Document title"
            @input="onTitleChange"
          />
        </div>

        <!-- Multiple documents indicator -->
        <div
          v-else
          class="p-3 bg-stone-50 rounded-lg border border-stone-200 text-sm text-stone-600"
        >
          <div class="flex items-center gap-2">
            <Icon name="heroicons:document-duplicate" class="h-5 w-5" />
            <span>{{ documents.length }} documents selected</span>
          </div>
          <p class="mt-1 text-xs text-stone-500">
            Title cannot be edited for multiple documents
          </p>
        </div>

        <!-- Category -->
        <div class="grid gap-2">
          <Label for="edit-category">Category</Label>
          <select
            id="edit-category"
            v-model="selectedCategory"
            @change="onCategoryChange"
            class="w-full p-2.5 border border-stone-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            :disabled="saving"
          >
            <option value="">No Category</option>
            <option
              v-for="cat in documentCategories"
              :key="cat.id"
              :value="cat.id"
            >
              {{ cat.name }}
            </option>
          </select>
          <p v-if="!isSingleDocument" class="text-xs text-stone-500">
            Leave as "No Category" to keep existing values unchanged
          </p>
        </div>

        <!-- Date Published -->
        <div class="grid gap-2">
          <Label for="edit-date">Date Published</Label>
          <Input
            id="edit-date"
            type="date"
            v-model="datePublished"
            @change="onDateChange"
            :disabled="saving"
          />
          <p v-if="!isSingleDocument" class="text-xs text-stone-500">
            Leave empty to keep existing dates unchanged
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          @click="dialogOpen = false"
          :disabled="saving"
        >
          Cancel
        </Button>
        <Button @click="save" :disabled="saving">
          <Icon
            v-if="saving"
            name="heroicons:arrow-path"
            class="h-4 w-4 mr-2 animate-spin"
          />
          {{ saving ? "Saving..." : "Save Changes" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
