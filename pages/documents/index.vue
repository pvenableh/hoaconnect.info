<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  middleware: "auth",
  layout: "auth",
});

interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "file";
  parent: string | null;
  children?: TreeNode[];
  data?: any;
  expanded?: boolean;
}

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
const allFolders = ref<any[]>([]);
const selectedParentFolder = ref<string | null>(null);

// Filter state
const category = ref<
  "all" | "bylaws" | "financials" | "meeting_minutes" | "notices"
>("all");
const status = ref<"published" | "draft" | "archived">("published");

// UI state
const showCreateFolderDialog = ref(false);
const newFolderName = ref("");
const creatingFolder = ref(false);
const expandedFolders = ref<Set<string>>(new Set());

// Drag and drop state
const draggedItem = ref<any>(null);
const draggedItemType = ref<"file" | "folder" | null>(null);
const dragOverItem = ref<string | null>(null);

// Load all folders recursively
const loadAllFolders = async () => {
  if (!orgFolder.value) return;

  try {
    // Get all folders that are descendants of the org folder
    const result = await folderComposable.list({
      filter: {
        // This will get all folders - we'll filter client-side
      },
    });

    if (Array.isArray(result)) {
      // Filter to only include folders that are part of our organization's tree
      // For now, we'll just use all folders and build the tree
      allFolders.value = result;
    } else {
      allFolders.value = [];
    }
  } catch (error) {
    console.error("Failed to fetch folders:", error);
    allFolders.value = [];
  }
};

// Build tree structure from flat folder list
const buildTree = (folders: any[], parentId: string | null = null): TreeNode[] => {
  return folders
    .filter((folder) => folder.parent === parentId)
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      type: "folder" as const,
      parent: folder.parent,
      data: folder,
      expanded: expandedFolders.value.has(folder.id),
      children: buildTree(folders, folder.id),
    }));
};

// Build complete tree with folders and documents
const documentTree = computed(() => {
  if (!orgFolder.value) return [];

  const tree = buildTree(allFolders.value, orgFolder.value);

  // Add documents to their respective folders
  if (documents.value) {
    const addDocumentsToTree = (nodes: TreeNode[]) => {
      nodes.forEach((node) => {
        if (node.type === "folder") {
          // Find documents in this folder
          const folderDocs = documents.value?.filter(
            (doc: any) => doc.file?.folder?.id === node.id
          ) || [];

          // Add document nodes
          const docNodes: TreeNode[] = folderDocs.map((doc: any) => ({
            id: doc.id,
            name: doc.title,
            type: "file" as const,
            parent: node.id,
            data: doc,
          }));

          node.children = [...(node.children || []), ...docNodes];

          // Recursively add documents to child folders
          addDocumentsToTree(node.children.filter(n => n.type === "folder"));
        }
      });
    };

    addDocumentsToTree(tree);
  }

  return tree;
});

// Create a new subfolder
const createFolder = async () => {
  if (!newFolderName.value.trim()) {
    toast.error("Folder name is required");
    return;
  }

  if (!selectedParentFolder.value) {
    toast.error("No parent folder selected");
    return;
  }

  creatingFolder.value = true;

  try {
    await folderComposable.create({
      name: newFolderName.value.trim(),
      parent: selectedParentFolder.value,
    });

    toast.success("Folder created successfully");
    newFolderName.value = "";
    showCreateFolderDialog.value = false;
    await loadAllFolders();
  } catch (error) {
    console.error("Failed to create folder:", error);
    toast.error("Failed to create folder");
  } finally {
    creatingFolder.value = false;
  }
};

// Delete a folder
const deleteFolder = async (folderId: string) => {
  if (
    !confirm(
      "Delete this folder? All files inside will be moved to the parent folder."
    )
  )
    return;

  try {
    await folderComposable.remove(folderId);
    await loadAllFolders();
    await refresh();
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
      fields: ["id", "title", "category", "status", "date_published", "file.*", "file.folder.*"],
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
    server: false,
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
  dragOverItem.value = null;
};

const onDragOver = (targetId: string, event: DragEvent) => {
  event.preventDefault();
  dragOverItem.value = targetId;
};

const onDragLeave = () => {
  dragOverItem.value = null;
};

const onDrop = async (targetFolderId: string, event: DragEvent) => {
  event.preventDefault();
  dragOverItem.value = null;

  if (!draggedItem.value || !draggedItemType.value) return;

  // Prevent dropping a folder into itself
  if (draggedItemType.value === "folder" && draggedItem.value.id === targetFolderId) {
    toast.error("Cannot move a folder into itself");
    endDrag();
    return;
  }

  // Prevent dropping a folder into its own descendant
  if (draggedItemType.value === "folder") {
    const isDescendant = (folderId: string, potentialDescendantId: string): boolean => {
      const folder = allFolders.value.find(f => f.id === potentialDescendantId);
      if (!folder) return false;
      if (folder.parent === folderId) return true;
      if (folder.parent) return isDescendant(folderId, folder.parent);
      return false;
    };

    if (isDescendant(draggedItem.value.id, targetFolderId)) {
      toast.error("Cannot move a folder into its own subfolder");
      endDrag();
      return;
    }
  }

  try {
    if (draggedItemType.value === "file") {
      // Move file to the target folder
      await moveToFolder(draggedItem.value.file.id, targetFolderId);
      toast.success("File moved successfully");
      await refresh();
    } else if (draggedItemType.value === "folder") {
      // Update folder's parent
      await folderComposable.update(draggedItem.value.id, {
        parent: targetFolderId,
      });
      toast.success("Folder moved successfully");
      await loadAllFolders();
    }
  } catch (error) {
    console.error("Failed to move item:", error);
    toast.error("Failed to move item");
  } finally {
    endDrag();
  }
};

// Toggle folder expansion
const toggleFolder = (folderId: string) => {
  if (expandedFolders.value.has(folderId)) {
    expandedFolders.value.delete(folderId);
  } else {
    expandedFolders.value.add(folderId);
  }
};

// Open create folder dialog with selected parent
const openCreateFolderDialog = (parentFolderId: string) => {
  selectedParentFolder.value = parentFolderId;
  showCreateFolderDialog.value = true;
};

// Initialize folders when organization is loaded
watch(
  orgFolder,
  async (newFolder) => {
    if (newFolder) {
      selectedParentFolder.value = newFolder;
      await loadAllFolders();
      // Expand root folders by default
      const rootFolders = allFolders.value.filter(f => f.parent === newFolder);
      rootFolders.forEach(f => expandedFolders.value.add(f.id));
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-7xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-center">
          <h1 class="text-3xl font-bold">Documents</h1>
          <div class="flex gap-2">
            <Button @click="openCreateFolderDialog(orgFolder!)" variant="outline">
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
            <Button @click="navigateTo(`/documents/upload?folderId=${orgFolder}`)">
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

        <!-- Document Tree -->
        <Card>
          <CardHeader>
            <CardTitle>Documents & Folders</CardTitle>
            <CardDescription>
              Organize your documents into folders. Drag and drop to move items.
            </CardDescription>
          </CardHeader>
          <CardContent class="p-4">
            <div class="space-y-1">
              <!-- Recursive Tree Component -->
              <template v-for="node in documentTree" :key="node.id">
                <TreeNodeComponent
                  :node="node"
                  :level="0"
                  :dragged-item="draggedItem"
                  :dragged-item-type="draggedItemType"
                  :drag-over-item="dragOverItem"
                  @toggle="toggleFolder"
                  @start-drag="startDrag"
                  @end-drag="endDrag"
                  @drag-over="onDragOver"
                  @drag-leave="onDragLeave"
                  @drop="onDrop"
                  @delete-folder="deleteFolder"
                  @delete-document="handleDelete"
                  @create-subfolder="openCreateFolderDialog"
                  @view-document="(doc) => window.open(getUrl(doc.file.id), '_blank')"
                />
              </template>
            </div>

            <!-- Empty state -->
            <div
              v-if="documentTree.length === 0"
              class="text-center py-12 text-stone-500"
            >
              No folders or documents found
            </div>
          </CardContent>
        </Card>
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

<!-- Tree Node Component -->
<script lang="ts">
export default {
  name: "TreeNodeComponent",
  props: {
    node: {
      type: Object as PropType<TreeNode>,
      required: true,
    },
    level: {
      type: Number,
      default: 0,
    },
    draggedItem: {
      type: Object,
      default: null,
    },
    draggedItemType: {
      type: String,
      default: null,
    },
    dragOverItem: {
      type: String,
      default: null,
    },
  },
  emits: [
    "toggle",
    "start-drag",
    "end-drag",
    "drag-over",
    "drag-leave",
    "drop",
    "delete-folder",
    "delete-document",
    "create-subfolder",
    "view-document",
  ],
  setup(props, { emit }) {
    const isExpanded = computed(() => props.node.expanded);
    const hasChildren = computed(() => props.node.children && props.node.children.length > 0);
    const isDragOver = computed(() => props.dragOverItem === props.node.id);
    const indentStyle = computed(() => ({
      paddingLeft: `${props.level * 20}px`,
    }));

    return {
      isExpanded,
      hasChildren,
      isDragOver,
      indentStyle,
    };
  },
};
</script>

<template>
  <div>
    <!-- Folder or File Item -->
    <div
      :draggable="true"
      @dragstart="$emit('start-drag', node.type === 'folder' ? node.data : node.data, node.type)"
      @dragend="$emit('end-drag')"
      @dragover="node.type === 'folder' ? $emit('drag-over', node.id, $event) : null"
      @dragleave="$emit('drag-leave')"
      @drop="node.type === 'folder' ? $emit('drop', node.id, $event) : null"
      :style="indentStyle"
      class="group flex items-center gap-2 px-3 py-2 rounded hover:bg-stone-100 cursor-pointer transition-colors"
      :class="{
        'bg-blue-50 border border-blue-300': isDragOver && node.type === 'folder',
        'bg-stone-50': !isDragOver,
      }"
    >
      <!-- Expand/Collapse Button (only for folders with children) -->
      <button
        v-if="node.type === 'folder' && hasChildren"
        @click.stop="$emit('toggle', node.id)"
        class="w-4 h-4 flex items-center justify-center text-stone-500 hover:text-stone-700"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-3 h-3 transition-transform"
          :class="{ 'rotate-90': isExpanded }"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
      <div v-else-if="node.type === 'folder'" class="w-4"></div>

      <!-- Icon -->
      <div class="flex-shrink-0">
        <!-- Folder Icon -->
        <svg
          v-if="node.type === 'folder'"
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          :class="isExpanded ? 'text-amber-500' : 'text-amber-400'"
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

        <!-- File Icon -->
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 text-stone-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>

      <!-- Name -->
      <span class="flex-1 text-sm truncate" :class="node.type === 'folder' ? 'font-medium' : ''">
        {{ node.name }}
      </span>

      <!-- Document metadata -->
      <div v-if="node.type === 'file'" class="flex items-center gap-2">
        <span class="text-xs px-2 py-0.5 bg-stone-200 rounded">
          {{ node.data.category }}
        </span>
        <span class="text-xs text-stone-500">
          {{ new Date(node.data.date_published).toLocaleDateString() }}
        </span>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <!-- Folder Actions -->
        <template v-if="node.type === 'folder'">
          <button
            @click.stop="$emit('create-subfolder', node.id)"
            class="p-1 hover:bg-stone-200 rounded"
            title="Create subfolder"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-stone-600"
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
          </button>
          <button
            @click.stop="$emit('delete-folder', node.id)"
            class="p-1 hover:bg-red-100 rounded"
            title="Delete folder"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-red-600"
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
        </template>

        <!-- File Actions -->
        <template v-else>
          <button
            @click.stop="$emit('view-document', node.data)"
            class="p-1 hover:bg-stone-200 rounded"
            title="View document"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-stone-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
          <button
            @click.stop="$emit('delete-document', node.data.id)"
            class="p-1 hover:bg-red-100 rounded"
            title="Delete document"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-red-600"
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
        </template>
      </div>
    </div>

    <!-- Recursively render children -->
    <template v-if="node.type === 'folder' && isExpanded && hasChildren">
      <TreeNodeComponent
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        :dragged-item="draggedItem"
        :dragged-item-type="draggedItemType"
        :drag-over-item="dragOverItem"
        @toggle="(id) => $emit('toggle', id)"
        @start-drag="(item, type) => $emit('start-drag', item, type)"
        @end-drag="$emit('end-drag')"
        @drag-over="(id, e) => $emit('drag-over', id, e)"
        @drag-leave="$emit('drag-leave')"
        @drop="(id, e) => $emit('drop', id, e)"
        @delete-folder="(id) => $emit('delete-folder', id)"
        @delete-document="(id) => $emit('delete-document', id)"
        @create-subfolder="(id) => $emit('create-subfolder', id)"
        @view-document="(doc) => $emit('view-document', doc)"
      />
    </template>
  </div>
</template>
