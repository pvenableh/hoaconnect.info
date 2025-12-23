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
import type { HoaDocument, HoaDocumentCategory } from "~~/types/directus";

const { list: listDocuments, update: updateDocument, remove: removeDocument } =
  useDirectusItems("hoa_documents");
const { list: listCategories } = useDirectusItems("hoa_document_categories");
const { getUrl } = useDirectusFiles();

// Get org context
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);
const organization = computed(() => currentOrg.value?.organization || null);
const orgFolder = computed(() => {
  const folder = organization.value?.folder;
  if (!folder) return null;
  return typeof folder === "string" ? folder : folder.id;
});

// UI state
const showBatchUploadDialog = ref(false);
const showBatchEditDialog = ref(false);
const showDeleteConfirmDialog = ref(false);

// Selection state
const selectedDocumentIds = ref<Set<string>>(new Set());
const selectedDocuments = ref<Map<string, HoaDocument>>(new Map());

// Drag state
const draggedDocument = ref<HoaDocument | null>(null);
const dragOverCategory = ref<string | null>(null);

// Status filter
const statusFilter = ref<"published" | "draft" | "archived">("published");

// Fetch categories
const { data: categories, refresh: refreshCategories } = await useAsyncData(
  `doc-categories-view-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listCategories({
      fields: ["id", "name", "slug", "description", "icon", "sort_by_date", "sort", "status"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "published" },
      },
      sort: ["sort", "name"],
    });
    return (result || []) as HoaDocumentCategory[];
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch all documents
const { data: documents, refresh: refreshDocuments } = await useAsyncData(
  `all-documents-view-${orgId.value}-${statusFilter.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listDocuments({
      fields: [
        "id",
        "title",
        "document_category.id",
        "document_category.name",
        "document_category.slug",
        "status",
        "date_published",
        "date_created",
        "date_updated",
        "folder",
        "file.*",
      ],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: statusFilter.value },
      },
      sort: ["sort", "-date_published", "-date_updated", "-date_created"],
    });
    return (result || []) as HoaDocument[];
  },
  {
    watch: [orgId, statusFilter],
    server: false,
  }
);

// Computed: documents grouped by category
const documentsByCategory = computed(() => {
  const grouped: Record<string, HoaDocument[]> = {
    uncategorized: [],
  };

  // Initialize with all categories
  categories.value?.forEach((cat) => {
    grouped[cat.id] = [];
  });

  // Group documents
  documents.value?.forEach((doc) => {
    const catId =
      typeof doc.document_category === "string"
        ? doc.document_category
        : doc.document_category?.id;

    if (catId && grouped[catId]) {
      grouped[catId].push(doc);
    } else {
      grouped.uncategorized.push(doc);
    }
  });

  return grouped;
});

// Computed: total documents
const totalDocuments = computed(() => documents.value?.length || 0);

// Selection helpers
const isSelected = (id: string) => selectedDocumentIds.value.has(id);

const toggleDocumentSelection = (doc: HoaDocument) => {
  const newIds = new Set(selectedDocumentIds.value);
  const newDocs = new Map(selectedDocuments.value);

  if (newIds.has(doc.id)) {
    newIds.delete(doc.id);
    newDocs.delete(doc.id);
  } else {
    newIds.add(doc.id);
    newDocs.set(doc.id, doc);
  }

  selectedDocumentIds.value = newIds;
  selectedDocuments.value = newDocs;
};

const selectAllInCategory = (categoryId: string) => {
  const docs = documentsByCategory.value[categoryId] || [];
  const newIds = new Set(selectedDocumentIds.value);
  const newDocs = new Map(selectedDocuments.value);

  docs.forEach((doc) => {
    newIds.add(doc.id);
    newDocs.set(doc.id, doc);
  });

  selectedDocumentIds.value = newIds;
  selectedDocuments.value = newDocs;
};

const clearSelection = () => {
  selectedDocumentIds.value = new Set();
  selectedDocuments.value = new Map();
};

const selectedDocumentsArray = computed(() => {
  return Array.from(selectedDocuments.value.values());
});

// Drag and drop handlers
const onDragStart = (doc: HoaDocument, event: DragEvent) => {
  draggedDocument.value = doc;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", doc.id);
  }
};

const onDragEnd = () => {
  draggedDocument.value = null;
  dragOverCategory.value = null;
};

const onDragOver = (categoryId: string, event: DragEvent) => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  dragOverCategory.value = categoryId;
};

const onDragLeave = () => {
  dragOverCategory.value = null;
};

const onDrop = async (targetCategoryId: string, event: DragEvent) => {
  event.preventDefault();
  dragOverCategory.value = null;

  if (!draggedDocument.value) return;

  const currentCategoryId =
    typeof draggedDocument.value.document_category === "string"
      ? draggedDocument.value.document_category
      : draggedDocument.value.document_category?.id || null;

  // If same category, no update needed
  if (
    (targetCategoryId === "uncategorized" && !currentCategoryId) ||
    targetCategoryId === currentCategoryId
  ) {
    onDragEnd();
    return;
  }

  try {
    await updateDocument(draggedDocument.value.id, {
      document_category: targetCategoryId === "uncategorized" ? null : targetCategoryId,
    });
    toast.success("Document moved to category");
    await refreshDocuments();
  } catch (error) {
    console.error("Failed to move document:", error);
    toast.error("Failed to move document");
  } finally {
    onDragEnd();
  }
};

// Batch operations
const handleBatchEditSaved = async () => {
  await refreshDocuments();
  clearSelection();
  showBatchEditDialog.value = false;
};

const confirmBatchDelete = () => {
  if (selectedDocuments.value.size > 0) {
    showDeleteConfirmDialog.value = true;
  }
};

const executeBatchDelete = async () => {
  const ids = Array.from(selectedDocumentIds.value);
  let successCount = 0;
  let errorCount = 0;

  for (const id of ids) {
    try {
      await removeDocument(id);
      successCount++;
    } catch (error) {
      console.error(`Failed to delete document ${id}:`, error);
      errorCount++;
    }
  }

  showDeleteConfirmDialog.value = false;

  if (errorCount === 0) {
    toast.success(`Deleted ${successCount} document(s)`);
  } else {
    toast.warning(`Deleted ${successCount}, failed ${errorCount}`);
  }

  await refreshDocuments();
  clearSelection();
};

// Download document
const downloadDocument = async (doc: HoaDocument) => {
  try {
    const file = doc.file as any;
    if (!file?.id) {
      toast.error("No file attached to this document");
      return;
    }

    const fileUrl = getUrl(file.id);
    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch file");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    const filename = file.filename_download || doc.title || "document";
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to download document:", error);
    toast.error("Failed to download document");
  }
};

// Handle batch upload completion
const handleBatchUploadComplete = async () => {
  showBatchUploadDialog.value = false;
  await refreshDocuments();
  toast.success("Documents uploaded successfully");
};

// Format date for display
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Get file icon based on type
const getFileIcon = (doc: HoaDocument): string => {
  const file = doc.file as any;
  if (!file?.type) return "heroicons:document";

  if (file.type.includes("pdf")) return "heroicons:document-text";
  if (file.type.includes("word") || file.type.includes("document"))
    return "heroicons:document";
  if (file.type.includes("sheet") || file.type.includes("excel"))
    return "heroicons:table-cells";
  return "heroicons:document";
};

// Get category by ID
const getCategoryById = (id: string): HoaDocumentCategory | undefined => {
  return categories.value?.find((cat) => cat.id === id);
};
</script>

<template>
  <div class="space-y-6">
    <!-- Header Actions -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <!-- Status Filter -->
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-stone-600">Status:</label>
          <select
            v-model="statusFilter"
            class="px-3 py-1.5 border border-stone-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <!-- Document count -->
        <span class="text-sm text-stone-500">
          {{ totalDocuments }} document{{ totalDocuments !== 1 ? "s" : "" }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Selection actions (shown when documents are selected) -->
        <template v-if="selectedDocuments.size > 0">
          <span class="text-sm text-blue-600 font-medium">
            {{ selectedDocuments.size }} selected
          </span>
          <Button variant="outline" size="sm" @click="clearSelection">
            Clear
          </Button>
          <Button variant="outline" size="sm" @click="showBatchEditDialog = true">
            <Icon name="heroicons:pencil-square" class="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" @click="confirmBatchDelete">
            <Icon name="heroicons:trash" class="h-4 w-4 mr-1" />
            Delete
          </Button>
        </template>

        <!-- Upload button -->
        <Button @click="showBatchUploadDialog = true">
          <Icon name="heroicons:cloud-arrow-up" class="h-4 w-4 mr-2" />
          Upload Documents
        </Button>
      </div>
    </div>

    <!-- Category Columns -->
    <div class="flex gap-4 overflow-x-auto pb-4">
      <!-- Uncategorized Column -->
      <div
        class="flex-shrink-0 w-80 bg-stone-100 rounded-xl border-2 transition-colors"
        :class="{
          'border-blue-400 bg-blue-50': dragOverCategory === 'uncategorized',
          'border-transparent': dragOverCategory !== 'uncategorized',
        }"
        @dragover="onDragOver('uncategorized', $event)"
        @dragleave="onDragLeave"
        @drop="onDrop('uncategorized', $event)"
      >
        <!-- Column Header -->
        <div class="p-4 border-b border-stone-200">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg bg-stone-200 flex items-center justify-center">
                <Icon name="heroicons:inbox" class="h-4 w-4 text-stone-600" />
              </div>
              <div>
                <h3 class="font-semibold text-stone-900">Uncategorized</h3>
                <p class="text-xs text-stone-500">
                  {{ documentsByCategory.uncategorized?.length || 0 }} documents
                </p>
              </div>
            </div>
            <button
              v-if="documentsByCategory.uncategorized?.length > 0"
              @click="selectAllInCategory('uncategorized')"
              class="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Select all
            </button>
          </div>
        </div>

        <!-- Document Cards -->
        <div class="p-2 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">
          <div
            v-for="doc in documentsByCategory.uncategorized"
            :key="doc.id"
            class="bg-white rounded-lg border shadow-sm p-3 cursor-move transition-all hover:shadow-md"
            :class="{
              'ring-2 ring-blue-500 bg-blue-50': isSelected(doc.id),
              'opacity-50': draggedDocument?.id === doc.id,
            }"
            draggable="true"
            @dragstart="onDragStart(doc, $event)"
            @dragend="onDragEnd"
            @click="toggleDocumentSelection(doc)"
          >
            <div class="flex items-start gap-3">
              <!-- Selection checkbox -->
              <div class="flex-shrink-0 pt-0.5">
                <div
                  class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                  :class="{
                    'bg-blue-500 border-blue-500': isSelected(doc.id),
                    'border-stone-300': !isSelected(doc.id),
                  }"
                >
                  <Icon
                    v-if="isSelected(doc.id)"
                    name="heroicons:check"
                    class="h-3 w-3 text-white"
                  />
                </div>
              </div>

              <!-- Document info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <Icon :name="getFileIcon(doc)" class="h-4 w-4 text-stone-400 flex-shrink-0" />
                  <h4 class="font-medium text-stone-900 truncate">{{ doc.title }}</h4>
                </div>
                <p class="text-xs text-stone-500 mt-1">
                  {{ formatDate(doc.date_published || doc.date_created) }}
                </p>
              </div>

              <!-- Actions -->
              <button
                @click.stop="downloadDocument(doc)"
                class="p-1 rounded hover:bg-stone-100 transition-colors"
                title="Download"
              >
                <Icon name="heroicons:arrow-down-tray" class="h-4 w-4 text-stone-400" />
              </button>
            </div>
          </div>

          <!-- Empty state -->
          <div
            v-if="!documentsByCategory.uncategorized?.length"
            class="text-center py-8 text-stone-400"
          >
            <Icon name="heroicons:inbox" class="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p class="text-sm">No uncategorized documents</p>
          </div>
        </div>
      </div>

      <!-- Category Columns -->
      <div
        v-for="category in categories"
        :key="category.id"
        class="flex-shrink-0 w-80 bg-stone-100 rounded-xl border-2 transition-colors"
        :class="{
          'border-blue-400 bg-blue-50': dragOverCategory === category.id,
          'border-transparent': dragOverCategory !== category.id,
        }"
        @dragover="onDragOver(category.id, $event)"
        @dragleave="onDragLeave"
        @drop="onDrop(category.id, $event)"
      >
        <!-- Column Header -->
        <div class="p-4 border-b border-stone-200">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon
                  :name="category.icon || 'heroicons:folder'"
                  class="h-4 w-4 text-primary"
                />
              </div>
              <div>
                <h3 class="font-semibold text-stone-900">{{ category.name }}</h3>
                <p class="text-xs text-stone-500">
                  {{ documentsByCategory[category.id]?.length || 0 }} documents
                </p>
              </div>
            </div>
            <button
              v-if="documentsByCategory[category.id]?.length > 0"
              @click="selectAllInCategory(category.id)"
              class="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Select all
            </button>
          </div>
        </div>

        <!-- Document Cards -->
        <div class="p-2 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">
          <div
            v-for="doc in documentsByCategory[category.id]"
            :key="doc.id"
            class="bg-white rounded-lg border shadow-sm p-3 cursor-move transition-all hover:shadow-md"
            :class="{
              'ring-2 ring-blue-500 bg-blue-50': isSelected(doc.id),
              'opacity-50': draggedDocument?.id === doc.id,
            }"
            draggable="true"
            @dragstart="onDragStart(doc, $event)"
            @dragend="onDragEnd"
            @click="toggleDocumentSelection(doc)"
          >
            <div class="flex items-start gap-3">
              <!-- Selection checkbox -->
              <div class="flex-shrink-0 pt-0.5">
                <div
                  class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                  :class="{
                    'bg-blue-500 border-blue-500': isSelected(doc.id),
                    'border-stone-300': !isSelected(doc.id),
                  }"
                >
                  <Icon
                    v-if="isSelected(doc.id)"
                    name="heroicons:check"
                    class="h-3 w-3 text-white"
                  />
                </div>
              </div>

              <!-- Document info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <Icon :name="getFileIcon(doc)" class="h-4 w-4 text-stone-400 flex-shrink-0" />
                  <h4 class="font-medium text-stone-900 truncate">{{ doc.title }}</h4>
                </div>
                <p class="text-xs text-stone-500 mt-1">
                  {{ formatDate(doc.date_published || doc.date_created) }}
                </p>
              </div>

              <!-- Actions -->
              <button
                @click.stop="downloadDocument(doc)"
                class="p-1 rounded hover:bg-stone-100 transition-colors"
                title="Download"
              >
                <Icon name="heroicons:arrow-down-tray" class="h-4 w-4 text-stone-400" />
              </button>
            </div>
          </div>

          <!-- Empty state -->
          <div
            v-if="!documentsByCategory[category.id]?.length"
            class="text-center py-8 text-stone-400"
          >
            <Icon :name="category.icon || 'heroicons:folder'" class="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p class="text-sm">No documents in this category</p>
            <p class="text-xs mt-1">Drag documents here to categorize</p>
          </div>
        </div>
      </div>

      <!-- Empty state if no categories -->
      <div
        v-if="!categories?.length"
        class="flex-shrink-0 w-80 bg-stone-100 rounded-xl border-2 border-dashed border-stone-300 p-8 text-center"
      >
        <Icon name="heroicons:folder-plus" class="h-12 w-12 mx-auto mb-4 text-stone-400" />
        <h3 class="font-medium text-stone-700">No categories yet</h3>
        <p class="text-sm text-stone-500 mt-2">
          Create categories to organize your documents
        </p>
      </div>
    </div>

    <!-- Batch Upload Dialog -->
    <Dialog v-model:open="showBatchUploadDialog">
      <DialogContent class="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Upload documents to your organization. Files will be stored in the default folder.
          </DialogDescription>
        </DialogHeader>
        <DocumentsBatchDocumentUpload
          :initial-folder="orgFolder"
          @complete="handleBatchUploadComplete"
          @close="showBatchUploadDialog = false"
        />
      </DialogContent>
    </Dialog>

    <!-- Batch Edit Dialog -->
    <DocumentsDocumentBatchEdit
      v-model:open="showBatchEditDialog"
      :documents="selectedDocumentsArray"
      @saved="handleBatchEditSaved"
    />

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteConfirmDialog">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete Documents</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {{ selectedDocuments.size }} document{{
              selectedDocuments.size !== 1 ? "s" : ""
            }}? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showDeleteConfirmDialog = false">
            Cancel
          </Button>
          <Button variant="destructive" @click="executeBatchDelete">
            Delete {{ selectedDocuments.size }} Document{{
              selectedDocuments.size !== 1 ? "s" : ""
            }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
