<script setup lang="ts">
import { toast } from "vue-sonner";
import { useDropZone } from "@vueuse/core";

definePageMeta({
  middleware: "auth",
  layout: "auth",
});

const { user } = useDirectusAuth();
const { list: listDocuments, remove: removeDocument } =
  useDirectusItems("hoa_documents");
const { getUrl, moveToFolder } = useDirectusFiles();
const folderComposable = useDirectusFolders();

// Await to ensure org is loaded during SSR
const { selectedOrgId, currentOrg } = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);
const organization = computed(() => currentOrg.value?.organization || null);
const orgFolder = computed(() => organization.value?.folder || null);

// Folder state
const folders = ref<any[]>([]);
const currentFolder = ref<string | null>(null);

// Filter state
const category = ref<
  "all" | "bylaws" | "financials" | "meeting_minutes" | "notices"
>("all");
const status = ref<"published" | "draft" | "archived">("published");

// UI state
const showCreateFolderDialog = ref(false);
const newFolderName = ref("");
const creatingFolder = ref(false);

// Drag and drop state
const draggedItem = ref<any>(null);
const draggedItemType = ref<"file" | "folder" | null>(null);

// Load folders (children of organization folder)
const loadFolders = async () => {
  if (!orgFolder.value) return;

  try {
    const result = await folderComposable.getByParent(orgFolder.value);
    folders.value = result || [];
  } catch (error) {
    console.error("Failed to fetch folders:", error);
    folders.value = [];
  }
};

// Create a new subfolder
const createFolder = async () => {
  if (!newFolderName.value.trim()) {
    toast.error("Folder name is required");
    return;
  }

  if (!currentFolder.value) {
    toast.error("No parent folder selected");
    return;
  }

  creatingFolder.value = true;

  try {
    await folderComposable.create({
      name: newFolderName.value.trim(),
      parent: currentFolder.value,
    });

    toast.success("Folder created successfully");
    newFolderName.value = "";
    showCreateFolderDialog.value = false;
    await loadFolders();
  } catch (error) {
    console.error("Failed to create folder:", error);
    toast.error("Failed to create folder");
  } finally {
    creatingFolder.value = false;
  }
};

// Delete a folder
const deleteFolder = async (folderId: string) => {
  if (!confirm("Delete this folder? All files inside will be moved to the parent folder.")) return;

  try {
    await folderComposable.remove(folderId);
    await loadFolders();
    toast.success("Folder deleted");
  } catch (error) {
    console.error("Failed to delete folder:", error);
    toast.error("Failed to delete folder");
  }
};

// Fetch documents
const { data: documents, refresh } = await useAsyncData(
  `documents-${orgId.value}-${category.value}-${status.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listDocuments({
      fields: ["id", "title", "category", "status", "date_published", "file.*"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: [status.value] },
        ...(category.value !== "all" && { category: { _eq: category.value } }),
      },
      sort: ["sort", "-date_published"],
    });
    return result || [];
  },
  {
    watch: [category, status, orgId],
    server: false, // Fetch client-side only to ensure auth session is available
  }
);

// Delete document
const handleDelete = async (id: string) => {
  if (!confirm("Delete this document?")) return;

  try {
    await removeDocument(id);
    await refresh();
    toast.success("Document deleted");
  } catch (error) {
    toast.error("Failed to delete document");
  }
};

// Drag and drop handlers
const startDrag = (item: any, type: "file" | "folder") => {
  draggedItem.value = item;
  draggedItemType.value = type;
};

const endDrag = () => {
  draggedItem.value = null;
  draggedItemType.value = null;
};

const onDrop = async (targetFolderId: string) => {
  if (!draggedItem.value || !draggedItemType.value) return;

  try {
    if (draggedItemType.value === "file") {
      // Move file to the target folder
      await moveToFolder(draggedItem.value.file.id, targetFolderId);
      toast.success("File moved successfully");
      await refresh();
    } else if (draggedItemType.value === "folder") {
      // Move folder to be a child of the target folder
      await folderComposable.update(draggedItem.value.id, {
        parent: targetFolderId,
      });
      toast.success("Folder moved successfully");
      await loadFolders();
    }
  } catch (error) {
    console.error("Failed to move item:", error);
    toast.error("Failed to move item");
  } finally {
    endDrag();
  }
};

// Drop zone setup
const dropZoneRef = ref<HTMLElement | null>(null);
const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop: (files) => {
    // Handle file upload via drag-and-drop
    console.log("Files dropped:", files);
  },
});

// Initialize folders when organization is loaded
watch(orgFolder, async (newFolder) => {
  if (newFolder) {
    currentFolder.value = newFolder;
    await loadFolders();
  }
}, { immediate: true });
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-7xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-center">
          <h1 class="text-3xl font-bold">Documents</h1>
          <div class="flex gap-2">
            <Button @click="showCreateFolderDialog = true" variant="outline">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Folder
            </Button>
            <Button @click="navigateTo('/documents/upload')">
              Upload Document
            </Button>
          </div>
        </div>

        <!-- Filters -->
        <Card>
          <CardContent class="pt-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium mb-2 block">Category</label>
                <select v-model="category" class="w-full p-2 border rounded">
                  <option value="all">All Categories</option>
                  <option value="bylaws">Bylaws</option>
                  <option value="financials">Financials</option>
                  <option value="meeting_minutes">Meeting Minutes</option>
                  <option value="notices">Notices</option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium mb-2 block">Status</label>
                <select v-model="status" class="w-full p-2 border rounded">
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Folder Tree -->
        <Card v-if="folders.length > 0">
          <CardHeader>
            <CardTitle>Folders</CardTitle>
            <CardDescription>
              Organize your documents into folders. Drag and drop files to move them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div
                v-for="folder in folders"
                :key="folder.id"
                :draggable="true"
                @dragstart="startDrag(folder, 'folder')"
                @dragend="endDrag"
                @dragover.prevent
                @drop.prevent="onDrop(folder.id)"
                class="relative p-4 border rounded-lg hover:border-stone-400 cursor-pointer transition-colors"
                :class="{
                  'border-blue-500 bg-blue-50': isOverDropZone,
                  'border-stone-200': !isOverDropZone,
                }"
              >
                <div class="flex flex-col items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-12 w-12 text-amber-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  <span class="text-sm font-medium text-center">{{
                    folder.name
                  }}</span>
                </div>
                <button
                  @click.stop="deleteFolder(folder.id)"
                  class="absolute top-2 right-2 text-red-500 hover:text-red-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Documents List -->
        <div class="grid grid-cols-1 gap-4" ref="dropZoneRef">
          <Card
            v-for="doc in documents"
            :key="doc.id"
            :draggable="true"
            @dragstart="startDrag(doc, 'file')"
            @dragend="endDrag"
            class="cursor-move"
          >
            <CardHeader>
              <div class="flex justify-between items-start">
                <div>
                  <CardTitle>{{ doc.title }}</CardTitle>
                  <CardDescription>
                    {{ doc.category }} •
                    {{ new Date(doc.date_published).toLocaleDateString() }}
                  </CardDescription>
                </div>
                <div class="flex gap-2">
                  <Button
                    v-if="doc.file"
                    @click="window.open(getUrl(doc.file.id), '_blank')"
                    variant="outline"
                    size="sm"
                  >
                    View
                  </Button>
                  <Button
                    @click="handleDelete(doc.id)"
                    variant="destructive"
                    size="sm"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div
            v-if="!documents?.length"
            class="text-center py-12 text-stone-500"
          >
            No documents found
          </div>
        </div>
      </div>
    </div>

    <!-- Create Folder Dialog -->
    <div
      v-if="showCreateFolderDialog"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showCreateFolderDialog = false"
    >
      <Card class="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Create New Folder</CardTitle>
          <CardDescription>
            Create a subfolder in {{ organization?.name }}
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <label class="text-sm font-medium mb-2 block">Folder Name</label>
            <Input
              v-model="newFolderName"
              placeholder="Enter folder name"
              @keyup.enter="createFolder"
            />
          </div>
          <div class="flex gap-2 justify-end">
            <Button
              @click="showCreateFolderDialog = false"
              variant="outline"
              :disabled="creatingFolder"
            >
              Cancel
            </Button>
            <Button @click="createFolder" :disabled="creatingFolder">
              {{ creatingFolder ? "Creating..." : "Create Folder" }}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
