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

interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "file";
  parent: string | null;
  children?: TreeNode[];
  data?: any;
  expanded?: boolean;
}

const { list: listDocuments, remove: removeDocument } =
  useDirectusItems("hoa_documents");
const { getUrl, moveToFolder } = useDirectusFiles();
const folderComposable = useDirectusFolders();
const { buildOrgPath, navigateToOrg } = useOrgNavigation();

// Await to ensure org is loaded during SSR
const { selectedOrgId, currentOrg } = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);
const organization = computed(() => currentOrg.value?.organization || null);
// Extract folder ID whether folder is a string or object
const orgFolder = computed(() => {
  const folder = organization.value?.folder;
  if (!folder) return null;
  return typeof folder === 'string' ? folder : folder.id;
});

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

// Edit state
const editingId = ref<string | null>(null);

// Load all folders recursively
const loadAllFolders = async () => {
  if (!orgFolder.value) return;

  try {
    const result = await folderComposable.list({
      filter: {},
      fields: ["id", "name", "parent"],
    });

    if (Array.isArray(result)) {
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
const buildTree = (
  folders: any[],
  parentId: string | null = null
): TreeNode[] => {
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

  // Build subfolders tree
  const subfolderTree = buildTree(allFolders.value, orgFolder.value);

  // Create the root org folder node
  const rootNode: TreeNode = {
    id: orgFolder.value,
    name: organization.value?.name || "Documents",
    type: "folder" as const,
    parent: null,
    expanded: expandedFolders.value.has(orgFolder.value),
    children: subfolderTree,
  };

  if (documents.value) {
    const addDocumentsToTree = (nodes: TreeNode[]) => {
      nodes.forEach((node) => {
        if (node.type === "folder") {
          // Get folder ID from document's file.folder (handle both string and object)
          const folderDocs =
            documents.value?.filter((doc: any) => {
              const docFolderId = doc.file?.folder?.id || doc.file?.folder;
              return docFolderId === node.id;
            }) || [];

          const docNodes: TreeNode[] = folderDocs.map((doc: any) => ({
            id: doc.id,
            name: doc.title,
            type: "file" as const,
            parent: node.id,
            data: doc,
          }));

          node.children = [...(node.children || []), ...docNodes];

          addDocumentsToTree(node.children.filter((n) => n.type === "folder"));
        }
      });
    };

    addDocumentsToTree([rootNode]);
  }

  return [rootNode];
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
    if (selectedParentFolder.value) {
      expandedFolders.value.add(selectedParentFolder.value);
    }
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

// Rename a folder
const renameFolder = async (folderId: string, newName: string) => {
  try {
    await folderComposable.update(folderId, { name: newName });
    await loadAllFolders();
    toast.success("Folder renamed");
  } catch (error) {
    console.error("Failed to rename folder:", error);
    toast.error("Failed to rename folder");
  }
};

// Rename a document
const renameDocument = async (documentId: string, newName: string) => {
  try {
    const { update: updateDocument } = useDirectusItems("hoa_documents");
    await updateDocument(documentId, { title: newName });
    await refresh();
    toast.success("Document renamed");
  } catch (error) {
    console.error("Failed to rename document:", error);
    toast.error("Failed to rename document");
  }
};

// Edit handlers
const startEdit = (id: string) => {
  editingId.value = id;
};

const cancelEdit = () => {
  editingId.value = null;
};

// Fetch documents
const { data: documents, refresh } = await useAsyncData(
  `documents-${orgId.value}-${category.value}-${status.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listDocuments({
      fields: [
        "id",
        "title",
        "category",
        "status",
        "date_published",
        "date_created",
        "date_updated",
        "file.*",
        "file.folder.*",
      ],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: [status.value] },
        ...(category.value !== "all" && { category: { _eq: category.value } }),
      },
      sort: ["sort", "-date_published", "-date_updated", "-date_created"],
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

// Download document
const downloadDocument = async (doc: any) => {
  try {
    const fileUrl = getUrl(doc.file.id);
    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch file");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // Use the document title or original filename for download
    const filename = doc.file.filename_download || doc.title || "document";
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

  if (
    draggedItemType.value === "folder" &&
    draggedItem.value.id === targetFolderId
  ) {
    toast.error("Cannot move a folder into itself");
    endDrag();
    return;
  }

  if (draggedItemType.value === "folder") {
    const isDescendant = (
      folderId: string,
      potentialDescendantId: string
    ): boolean => {
      const folder = allFolders.value.find(
        (f) => f.id === potentialDescendantId
      );
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
      await moveToFolder(draggedItem.value.file.id, targetFolderId);
      toast.success("File moved successfully");
      await Promise.all([refresh(), loadAllFolders()]);
    } else if (draggedItemType.value === "folder") {
      await folderComposable.update(draggedItem.value.id, {
        parent: targetFolderId,
      });
      toast.success("Folder moved successfully");
      await loadAllFolders();
      expandedFolders.value = new Set(expandedFolders.value);
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
      // Expand the org folder and its immediate children by default
      expandedFolders.value.add(newFolder);
      const rootFolders = allFolders.value.filter(
        (f) => f.parent === newFolder
      );
      rootFolders.forEach((f) => expandedFolders.value.add(f.id));
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
            <Button
              @click="openCreateFolderDialog(orgFolder!)"
              variant="outline"
            >
              <Icon name="heroicons:plus" class="h-4 w-4 mr-2" />
              New Folder
            </Button>
            <Button
              @click="navigateToOrg(`/documents/upload?folderId=${orgFolder}`)"
            >
              Upload Document
            </Button>
          </div>
        </div>

        <!-- Filters -->
        <TooltipProvider>
          <div class="space-y-6 flex flex-row justify-between">
            <!-- Category Filters -->
            <div>
              <label class="text-sm font-medium mb-3 block">Category</label>
              <div class="flex gap-2 flex-wrap">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      @click="category = 'all'"
                      :class="[
                        'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                        category === 'all'
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background border-border hover:border-primary/50',
                      ]"
                    >
                      <Icon name="heroicons:bars-3" class="h-6 w-6" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent> All Categories </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      @click="category = 'bylaws'"
                      :class="[
                        'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                        category === 'bylaws'
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background border-border hover:border-primary/50',
                      ]"
                    >
                      <Icon name="heroicons:scale" class="h-6 w-6" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent> Bylaws </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      @click="category = 'financials'"
                      :class="[
                        'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                        category === 'financials'
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background border-border hover:border-primary/50',
                      ]"
                    >
                      <Icon name="heroicons:currency-dollar" class="h-6 w-6" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent> Financials </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      @click="category = 'meeting_minutes'"
                      :class="[
                        'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                        category === 'meeting_minutes'
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background border-border hover:border-primary/50',
                      ]"
                    >
                      <Icon name="heroicons:user-group" class="h-6 w-6" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent> Meeting Minutes </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      @click="category = 'notices'"
                      :class="[
                        'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                        category === 'notices'
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background border-border hover:border-primary/50',
                      ]"
                    >
                      <Icon name="heroicons:bell" class="h-6 w-6" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent> Notices </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <!-- Status Filters -->
            <div>
              <label class="text-sm font-medium mb-3 block">Status</label>
              <div class="flex gap-2 flex-wrap">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      @click="status = 'published'"
                      :class="[
                        'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                        status === 'published'
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background border-border hover:border-primary/50',
                      ]"
                    >
                      <Icon name="heroicons:check" class="h-6 w-6" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent> Published </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      @click="status = 'draft'"
                      :class="[
                        'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                        status === 'draft'
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background border-border hover:border-primary/50',
                      ]"
                    >
                      <Icon name="heroicons:pencil-square" class="h-6 w-6" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent> Draft </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      @click="status = 'archived'"
                      :class="[
                        'w-[50px] h-[50px] rounded-lg border-2 transition-all flex items-center justify-center',
                        status === 'archived'
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background border-border hover:border-primary/50',
                      ]"
                    >
                      <Icon name="heroicons:archive-box" class="h-6 w-6" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent> Archived </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </TooltipProvider>

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
                :editing-id="editingId"
                @toggle="toggleFolder"
                @start-drag="startDrag"
                @end-drag="endDrag"
                @drag-over="onDragOver"
                @drag-leave="onDragLeave"
                @drop="onDrop"
                @delete-folder="deleteFolder"
                @delete-document="handleDelete"
                @create-subfolder="openCreateFolderDialog"
                @view-document="downloadDocument"
                @rename-folder="renameFolder"
                @rename-document="renameDocument"
                @start-edit="startEdit"
                @cancel-edit="cancelEdit"
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
    <Dialog v-model:open="showCreateFolderDialog">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogDescription>
            Create a subfolder in {{ organization?.name }}
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid gap-2">
            <Label for="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              v-model="newFolderName"
              placeholder="Enter folder name"
              @keyup.enter="createFolder"
            />
          </div>
        </div>
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
