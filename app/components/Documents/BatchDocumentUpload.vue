<script setup lang="ts">
import { toast } from "vue-sonner";
import { useDropZone } from "@vueuse/core";
import type { HoaDocumentCategory } from "~~/types/directus";

interface QueuedFile {
  id: string;
  file: File;
  title: string;
  status: "pending" | "uploading" | "success" | "error";
  errorMessage?: string;
}

interface Props {
  initialFolder?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  initialFolder: null,
});

const emit = defineEmits<{
  (e: "complete"): void;
  (e: "close"): void;
}>();

const { create: createDocument } = useDirectusItems("hoa_documents");
const { list: listCategories, create: createCategory } = useDirectusItems("hoa_document_categories");
const { upload: uploadFile } = useDirectusFiles();
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const folderComposable = useDirectusFolders();

const orgId = computed(() => selectedOrgId.value);
const organization = computed(() => currentOrg.value?.organization || null);
const orgFolder = computed(() => {
  const folder = organization.value?.folder;
  if (!folder) return null;
  return typeof folder === "string" ? folder : folder.id;
});

// Form state
const selectedCategory = ref<string>("");
const selectedFolder = ref<string>("");
const documentStatus = ref<"draft" | "published">("draft");

// New category creation state
const showNewCategoryInput = ref(false);
const newCategoryName = ref("");
const creatingCategory = ref(false);

// File queue
const fileQueue = ref<QueuedFile[]>([]);
const isUploading = ref(false);
const uploadProgress = ref({ current: 0, total: 0 });

// Categories and folders
const documentCategories = ref<HoaDocumentCategory[]>([]);
const subfolders = ref<any[]>([]);

// Drag and drop setup
const dropZoneRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop: (files) => {
    if (files && files.length > 0) {
      addFilesToQueue(Array.from(files));
    }
  },
});

/**
 * Generate a clean title from filename
 */
const generateTitle = (filename: string): string => {
  return filename
    .replace(/\.[^/.]+$/, "") // Remove extension
    .replace(/[-_]/g, " ") // Replace dashes and underscores with spaces
    .replace(/\s+/g, " ") // Normalize multiple spaces
    .trim();
};

/**
 * Add files to the upload queue
 */
const addFilesToQueue = (files: File[]) => {
  const newFiles: QueuedFile[] = files.map((file) => ({
    id: crypto.randomUUID(),
    file,
    title: generateTitle(file.name),
    status: "pending" as const,
  }));

  fileQueue.value = [...fileQueue.value, ...newFiles];
  toast.success(`${files.length} file${files.length > 1 ? "s" : ""} added to queue`);
};

/**
 * Remove a file from the queue
 */
const removeFromQueue = (id: string) => {
  fileQueue.value = fileQueue.value.filter((f) => f.id !== id);
};

/**
 * Update a file's title
 */
const updateTitle = (id: string, newTitle: string) => {
  const file = fileQueue.value.find((f) => f.id === id);
  if (file) {
    file.title = newTitle;
  }
};

/**
 * Clear all files from queue
 */
const clearQueue = () => {
  fileQueue.value = [];
};

/**
 * Handle file input change
 */
const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    addFilesToQueue(Array.from(target.files));
    target.value = ""; // Reset input
  }
};

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

/**
 * Upload all files in the queue
 */
const uploadAll = async () => {
  if (fileQueue.value.length === 0) {
    toast.error("No files to upload");
    return;
  }

  if (!orgId.value) {
    toast.error("No organization selected");
    return;
  }

  isUploading.value = true;
  uploadProgress.value = { current: 0, total: fileQueue.value.length };

  const targetFolder = selectedFolder.value || orgFolder.value;
  let successCount = 0;
  let errorCount = 0;

  for (const queuedFile of fileQueue.value) {
    if (queuedFile.status === "success") {
      uploadProgress.value.current++;
      continue;
    }

    queuedFile.status = "uploading";

    try {
      // Upload the file
      const fileResult = (await uploadFile(queuedFile.file, {
        title: queuedFile.title,
        folder: targetFolder || undefined,
      })) as any;

      // Create the document entry
      await createDocument({
        title: queuedFile.title,
        document_category: selectedCategory.value || null,
        status: documentStatus.value,
        organization: orgId.value,
        file: fileResult.id,
        folder: targetFolder || null,
        date_published:
          documentStatus.value === "published" ? new Date().toISOString() : null,
        sort: 0,
      });

      queuedFile.status = "success";
      successCount++;
    } catch (error: any) {
      queuedFile.status = "error";
      queuedFile.errorMessage = error.message || "Upload failed";
      errorCount++;
    }

    uploadProgress.value.current++;
  }

  isUploading.value = false;

  // Show summary toast
  if (errorCount === 0) {
    toast.success(`All ${successCount} documents uploaded successfully!`);
    // Clear successful uploads and emit complete
    setTimeout(() => {
      emit("complete");
    }, 500);
  } else if (successCount > 0) {
    toast.warning(`${successCount} uploaded, ${errorCount} failed. Check errors below.`);
  } else {
    toast.error(`All ${errorCount} uploads failed`);
  }
};

/**
 * Retry failed uploads
 */
const retryFailed = () => {
  fileQueue.value.forEach((f) => {
    if (f.status === "error") {
      f.status = "pending";
      f.errorMessage = undefined;
    }
  });
  uploadAll();
};

/**
 * Get file type icon
 */
const getFileIcon = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "heroicons:document-text";
    case "doc":
    case "docx":
      return "heroicons:document";
    case "xls":
    case "xlsx":
      return "heroicons:table-cells";
    default:
      return "heroicons:paper-clip";
  }
};

/**
 * Format file size
 */
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
};

/**
 * Flatten nested folder tree
 */
const flattenFolders = (folders: any[], level = 0): any[] => {
  const result: any[] = [];
  for (const folder of folders) {
    result.push({ id: folder.id, name: folder.name, level });
    if (folder.children?.length > 0) {
      result.push(...flattenFolders(folder.children, level + 1));
    }
  }
  return result;
};

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

// Create a new category
const handleCreateCategory = async () => {
  if (!newCategoryName.value.trim()) {
    toast.error("Please enter a category name");
    return;
  }

  if (!orgId.value) {
    toast.error("No organization selected");
    return;
  }

  creatingCategory.value = true;

  try {
    // Generate slug from name
    const slug = newCategoryName.value.trim().toLowerCase().replace(/\s+/g, "_");

    const newCategory = await createCategory({
      name: newCategoryName.value.trim(),
      slug,
      status: "published",
      organization: orgId.value,
      sort: documentCategories.value.length,
    }) as HoaDocumentCategory;

    // Add to local list and select it
    documentCategories.value.push(newCategory);
    selectedCategory.value = newCategory.id;

    // Reset form
    newCategoryName.value = "";
    showNewCategoryInput.value = false;
    toast.success("Category created successfully");
  } catch (error: any) {
    console.error("Failed to create category:", error);
    toast.error(error.message || "Failed to create category");
  } finally {
    creatingCategory.value = false;
  }
};

// Load folders
watch(
  orgFolder,
  async (newFolder) => {
    if (newFolder) {
      // Use initialFolder if provided, otherwise default to org root folder
      selectedFolder.value = props.initialFolder || newFolder;
      try {
        const folderTree = await folderComposable.getTree(newFolder);
        subfolders.value = flattenFolders(folderTree);
      } catch (error) {
        console.error("Failed to fetch subfolders:", error);
        subfolders.value = [];
      }
    }
  },
  { immediate: true }
);

// Update selected folder when initialFolder prop changes
watch(
  () => props.initialFolder,
  (newInitialFolder) => {
    if (newInitialFolder) {
      selectedFolder.value = newInitialFolder;
    } else if (orgFolder.value) {
      selectedFolder.value = orgFolder.value;
    }
  },
  { immediate: true }
);

// Load categories on mount
watch(orgId, () => loadCategories(), { immediate: true });

// Computed properties
const pendingCount = computed(
  () => fileQueue.value.filter((f) => f.status === "pending").length
);
const successCount = computed(
  () => fileQueue.value.filter((f) => f.status === "success").length
);
const errorCount = computed(
  () => fileQueue.value.filter((f) => f.status === "error").length
);
const hasErrors = computed(() => errorCount.value > 0);
const allComplete = computed(
  () => fileQueue.value.length > 0 && pendingCount.value === 0 && !isUploading.value
);
</script>

<template>
  <div class="space-y-6">
    <!-- Drop Zone -->
    <div
      ref="dropZoneRef"
      class="relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer"
      :class="{
        'border-blue-500 bg-blue-50 scale-[1.02]': isOverDropZone,
        'border-stone-300 bg-stone-50 hover:border-blue-400 hover:bg-blue-50/50':
          !isOverDropZone,
      }"
      @click="triggerFileInput"
    >
      <div class="flex flex-col items-center gap-4">
        <div
          class="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200"
          :class="{
            'bg-blue-100 scale-110': isOverDropZone,
            'bg-stone-200': !isOverDropZone,
          }"
        >
          <Icon
            name="heroicons:cloud-arrow-up"
            class="h-10 w-10 transition-colors"
            :class="{
              'text-blue-600': isOverDropZone,
              'text-stone-500': !isOverDropZone,
            }"
          />
        </div>

        <div>
          <p class="text-xl font-semibold text-stone-700">
            {{ isOverDropZone ? "Drop files here" : "Drag and drop files here" }}
          </p>
          <p class="text-sm text-stone-500 mt-1">
            or <span class="text-blue-600 font-medium">click to browse</span>
          </p>
        </div>

        <p class="text-xs text-stone-400">PDF, Word, Excel files accepted</p>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        multiple
        @change="handleFileChange"
        class="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx"
      />
    </div>

    <!-- Options Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="text-sm font-medium mb-2 block text-stone-700">Category</label>
        <!-- Fixed height container to prevent layout jump -->
        <div class="min-h-[72px]">
          <!-- Category select mode -->
          <div v-if="!showNewCategoryInput" class="space-y-2">
            <select
              v-model="selectedCategory"
              class="w-full p-2.5 border border-stone-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              :disabled="isUploading"
            >
              <option value="">No Category</option>
              <option v-for="cat in documentCategories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
            <button
              type="button"
              @click="showNewCategoryInput = true"
              class="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              :disabled="isUploading"
            >
              <Icon name="heroicons:plus" class="h-4 w-4" />
              Create New Category
            </button>
          </div>
          <!-- New category input mode -->
          <div v-else class="space-y-2">
            <input
              v-model="newCategoryName"
              type="text"
              placeholder="Category name"
              class="w-full p-2.5 border border-stone-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              :disabled="creatingCategory"
              @keyup.enter="handleCreateCategory"
            />
            <div class="flex gap-2">
              <button
                type="button"
                @click="handleCreateCategory"
                :disabled="creatingCategory || !newCategoryName.trim()"
                class="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <Icon v-if="creatingCategory" name="heroicons:arrow-path" class="h-4 w-4 animate-spin inline mr-1" />
                {{ creatingCategory ? 'Creating...' : 'Create Category' }}
              </button>
              <button
                type="button"
                @click="showNewCategoryInput = false; newCategoryName = ''"
                :disabled="creatingCategory"
                class="px-3 py-2 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 transition-colors text-stone-600 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label class="text-sm font-medium mb-2 block text-stone-700">Folder</label>
        <select
          v-model="selectedFolder"
          class="w-full p-2.5 border border-stone-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          :disabled="isUploading"
        >
          <option :value="orgFolder">{{ organization?.name }} (Root)</option>
          <option v-for="folder in subfolders" :key="folder.id" :value="folder.id">
            {{ "├─ ".repeat(folder.level) }}{{ folder.name }}
          </option>
        </select>
      </div>

      <div>
        <label class="text-sm font-medium mb-2 block text-stone-700">Status</label>
        <select
          v-model="documentStatus"
          class="w-full p-2.5 border border-stone-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          :disabled="isUploading"
        >
          <option value="draft">Draft (Review First)</option>
          <option value="published">Published (Visible to Members)</option>
        </select>
      </div>
    </div>

    <!-- File Queue -->
    <div v-if="fileQueue.length > 0" class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-stone-700">
          Files to Upload
          <span class="text-stone-400 font-normal">({{ fileQueue.length }})</span>
        </h3>
        <Button
          v-if="!isUploading && pendingCount > 0"
          variant="ghost"
          size="sm"
          @click="clearQueue"
          class="text-stone-500 hover:text-red-600"
        >
          Clear All
        </Button>
      </div>

      <!-- Progress Bar (when uploading) -->
      <div v-if="isUploading" class="bg-stone-100 rounded-full h-2 overflow-hidden">
        <div
          class="bg-blue-500 h-full transition-all duration-300 ease-out"
          :style="{
            width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
          }"
        />
      </div>

      <!-- File List -->
      <div class="space-y-2 max-h-80 overflow-y-auto">
        <div
          v-for="queuedFile in fileQueue"
          :key="queuedFile.id"
          class="flex items-center gap-3 p-3 bg-white border rounded-lg transition-all duration-200"
          :class="{
            'border-stone-200': queuedFile.status === 'pending',
            'border-blue-300 bg-blue-50': queuedFile.status === 'uploading',
            'border-green-300 bg-green-50': queuedFile.status === 'success',
            'border-red-300 bg-red-50': queuedFile.status === 'error',
          }"
        >
          <!-- File Icon -->
          <div
            class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            :class="{
              'bg-stone-100': queuedFile.status === 'pending',
              'bg-blue-100': queuedFile.status === 'uploading',
              'bg-green-100': queuedFile.status === 'success',
              'bg-red-100': queuedFile.status === 'error',
            }"
          >
            <!-- Spinner when uploading -->
            <Icon
              v-if="queuedFile.status === 'uploading'"
              name="heroicons:arrow-path"
              class="h-5 w-5 text-blue-600 animate-spin"
            />
            <!-- Checkmark when success -->
            <Icon
              v-else-if="queuedFile.status === 'success'"
              name="heroicons:check"
              class="h-5 w-5 text-green-600"
            />
            <!-- X when error -->
            <Icon
              v-else-if="queuedFile.status === 'error'"
              name="heroicons:x-mark"
              class="h-5 w-5 text-red-600"
            />
            <!-- File icon when pending -->
            <Icon
              v-else
              :name="getFileIcon(queuedFile.file.name)"
              class="h-5 w-5 text-stone-500"
            />
          </div>

          <!-- File Info -->
          <div class="flex-1 min-w-0">
            <input
              v-if="queuedFile.status === 'pending'"
              v-model="queuedFile.title"
              class="w-full font-medium text-stone-700 bg-transparent border-b border-transparent hover:border-stone-300 focus:border-blue-500 focus:outline-none transition-colors"
              @click.stop
            />
            <p v-else class="font-medium text-stone-700 truncate">
              {{ queuedFile.title }}
            </p>
            <p class="text-xs text-stone-500 truncate">
              {{ queuedFile.file.name }} · {{ formatSize(queuedFile.file.size) }}
            </p>
            <p v-if="queuedFile.errorMessage" class="text-xs text-red-600 mt-0.5">
              {{ queuedFile.errorMessage }}
            </p>
          </div>

          <!-- Remove Button -->
          <button
            v-if="queuedFile.status === 'pending' || queuedFile.status === 'error'"
            @click.stop="removeFromQueue(queuedFile.id)"
            class="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            :disabled="isUploading"
          >
            <Icon name="heroicons:x-mark" class="h-5 w-5" />
          </button>
        </div>
      </div>

      <!-- Summary Stats -->
      <div
        v-if="allComplete"
        class="flex items-center gap-4 p-3 bg-stone-50 rounded-lg text-sm"
      >
        <span v-if="successCount > 0" class="text-green-600 font-medium">
          {{ successCount }} uploaded
        </span>
        <span v-if="errorCount > 0" class="text-red-600 font-medium">
          {{ errorCount }} failed
        </span>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="text-center py-8 text-stone-400"
    >
      <p>No files selected yet</p>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center justify-between pt-4 border-t">
      <Button variant="outline" @click="emit('close')" :disabled="isUploading">
        {{ allComplete && !hasErrors ? "Done" : "Cancel" }}
      </Button>

      <div class="flex gap-2">
        <Button
          v-if="hasErrors && !isUploading"
          variant="outline"
          @click="retryFailed"
        >
          <Icon name="heroicons:arrow-path" class="h-4 w-4 mr-2" />
          Retry Failed
        </Button>

        <Button
          @click="uploadAll"
          :disabled="fileQueue.length === 0 || isUploading || (allComplete && !hasErrors)"
        >
          <Icon
            v-if="isUploading"
            name="heroicons:arrow-path"
            class="h-4 w-4 mr-2 animate-spin"
          />
          <Icon v-else name="heroicons:cloud-arrow-up" class="h-4 w-4 mr-2" />
          {{
            isUploading
              ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
              : `Upload ${pendingCount} File${pendingCount !== 1 ? "s" : ""}`
          }}
        </Button>
      </div>
    </div>
  </div>
</template>
