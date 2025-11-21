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
      // Refresh both folders and documents to ensure UI updates
      await Promise.all([refresh(), loadAllFolders()]);
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
            <div class="space-y-6">
              <!-- Category Filters -->
              <div>
                <label class="text-sm font-medium mb-3 block">Category</label>
                <div class="flex gap-2 flex-wrap">
                  <button
                    @click="category = 'all'"
                    :class="[
                      'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                      category === 'all'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-border hover:border-primary/50'
                    ]"
                    title="All Categories"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <button
                    @click="category = 'bylaws'"
                    :class="[
                      'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                      category === 'bylaws'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-border hover:border-primary/50'
                    ]"
                    title="Bylaws"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                    </svg>
                  </button>
                  <button
                    @click="category = 'financials'"
                    :class="[
                      'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                      category === 'financials'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-border hover:border-primary/50'
                    ]"
                    title="Financials"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <button
                    @click="category = 'meeting_minutes'"
                    :class="[
                      'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                      category === 'meeting_minutes'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-border hover:border-primary/50'
                    ]"
                    title="Meeting Minutes"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </button>
                  <button
                    @click="category = 'notices'"
                    :class="[
                      'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                      category === 'notices'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-border hover:border-primary/50'
                    ]"
                    title="Notices"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Status Filters -->
              <div>
                <label class="text-sm font-medium mb-3 block">Status</label>
                <div class="flex gap-2 flex-wrap">
                  <button
                    @click="status = 'published'"
                    :class="[
                      'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                      status === 'published'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-border hover:border-primary/50'
                    ]"
                    title="Published"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    @click="status = 'draft'"
                    :class="[
                      'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                      status === 'draft'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-border hover:border-primary/50'
                    ]"
                    title="Draft"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    @click="status = 'archived'"
                    :class="[
                      'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                      status === 'archived'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-border hover:border-primary/50'
                    ]"
                    title="Archived"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </button>
                </div>
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
              <TreeNode
                v-for="node in documentTree"
                :key="node.id"
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
