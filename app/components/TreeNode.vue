<script setup lang="ts">
interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "file";
  parent: string | null;
  children?: TreeNode[];
  data?: any;
  expanded?: boolean;
}

interface Props {
  node: TreeNode;
  level?: number;
  draggedItem?: any;
  draggedItemType?: string | null;
  dragOverItem?: string | null;
  editingId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  level: 0,
  draggedItem: null,
  draggedItemType: null,
  dragOverItem: null,
  editingId: null,
});

const emit = defineEmits<{
  toggle: [id: string];
  startDrag: [item: any, type: "file" | "folder"];
  endDrag: [];
  dragOver: [id: string, event: DragEvent];
  dragLeave: [];
  drop: [id: string, event: DragEvent];
  deleteFolder: [id: string];
  deleteDocument: [id: string];
  createSubfolder: [id: string];
  viewDocument: [doc: any];
  renameFolder: [id: string, newName: string];
  renameDocument: [id: string, newName: string];
  startEdit: [id: string];
  cancelEdit: [];
}>();

const isExpanded = computed(() => props.node.expanded);
const hasChildren = computed(
  () => props.node.children && props.node.children.length > 0
);
const isDragOver = computed(() => props.dragOverItem === props.node.id);
const isEditing = computed(() => props.editingId === props.node.id);
const indentStyle = computed(() => ({
  paddingLeft: `${props.level * 40}px`,
}));

const editName = ref("");
const editInput = ref<HTMLInputElement | null>(null);

const startEditing = () => {
  editName.value = props.node.name;
  emit("startEdit", props.node.id);
  nextTick(() => {
    editInput.value?.focus();
    editInput.value?.select();
  });
};

const saveEdit = () => {
  if (editName.value.trim() && editName.value !== props.node.name) {
    if (props.node.type === "folder") {
      emit("renameFolder", props.node.id, editName.value.trim());
    } else {
      emit("renameDocument", props.node.id, editName.value.trim());
    }
  }
  emit("cancelEdit");
};

const cancelEditing = () => {
  editName.value = "";
  emit("cancelEdit");
};

// Get the display date with priority: date_published > date_updated > date_created
const displayDate = computed(() => {
  if (props.node.type !== "file" || !props.node.data) return null;

  const data = props.node.data;

  // Priority 1: date_published
  if (data.date_published) {
    return new Date(data.date_published).toLocaleDateString();
  }

  // Priority 2: date_updated
  if (data.date_updated) {
    return new Date(data.date_updated).toLocaleDateString();
  }

  // Priority 3: date_created (default, should always exist)
  if (data.date_created) {
    return new Date(data.date_created).toLocaleDateString();
  }

  return "No date";
});
</script>

<template>
  <div>
    <!-- Folder or File Item -->
    <div
      :draggable="true"
      @dragstart="
        emit(
          'startDrag',
          node.type === 'folder' ? node.data : node.data,
          node.type
        )
      "
      @dragend="emit('endDrag')"
      @dragover="
        node.type === 'folder' ? emit('dragOver', node.id, $event) : null
      "
      @dragleave="emit('dragLeave')"
      @drop="node.type === 'folder' ? emit('drop', node.id, $event) : null"
      :style="indentStyle"
      class="group flex items-center gap-2 px-3 py-2 rounded hover:bg-stone-100 cursor-pointer transition-colors"
      :class="{
        'bg-blue-50 border border-blue-300':
          isDragOver && node.type === 'folder',
        'bg-stone-50': !isDragOver,
      }"
    >
      <!-- Expand/Collapse Button (only for folders with children) -->
      <button
        v-if="node.type === 'folder' && hasChildren"
        @click.stop="emit('toggle', node.id)"
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
      <input
        v-if="isEditing"
        v-model="editName"
        @keyup.enter="saveEdit"
        @keyup.esc="cancelEditing"
        @blur="saveEdit"
        class="flex-1 text-sm px-2 py-1 border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary"
        :class="node.type === 'folder' ? 'font-medium' : ''"
        ref="editInput"
        @click.stop
      />
      <span
        v-else
        @dblclick="startEditing"
        class="flex-1 text-sm truncate cursor-pointer"
        :class="node.type === 'folder' ? 'font-medium' : ''"
        :title="'Double-click to rename'"
      >
        {{ node.name }}
      </span>

      <!-- Document metadata -->
      <div v-if="node.type === 'file'" class="flex items-center gap-2">
        <span class="text-xs px-2 py-0.5 bg-stone-200 rounded">
          {{ node.data.document_category?.name }}
        </span>
        <span class="text-xs text-stone-500">
          {{ displayDate }}
        </span>
      </div>

      <!-- Actions -->
      <div
        class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <!-- Folder Actions -->
        <template v-if="node.type === 'folder'">
          <button
            @click.stop="emit('createSubfolder', node.id)"
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
            @click.stop="emit('deleteFolder', node.id)"
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
            @click.stop="emit('viewDocument', node.data)"
            class="p-1 hover:bg-stone-200 rounded"
            title="View document"
          >
            <Icon name="i-lucide-download" class="h-4 w-4 text-stone-600" />
          </button>
          <button
            @click.stop="emit('deleteDocument', node.data.id)"
            class="p-1 hover:bg-red-100 rounded"
            title="Delete document"
          >
            <Icon name="i-lucide-trash-2" class="h-4 w-4 text-red-600" />
          </button>
        </template>
      </div>
    </div>

    <!-- Recursively render children -->
    <template v-if="node.type === 'folder' && isExpanded && hasChildren">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        :dragged-item="draggedItem"
        :dragged-item-type="draggedItemType"
        :drag-over-item="dragOverItem"
        :editing-id="editingId"
        @toggle="(id) => emit('toggle', id)"
        @start-drag="(item, type) => emit('startDrag', item, type)"
        @end-drag="emit('endDrag')"
        @drag-over="(id, e) => emit('dragOver', id, e)"
        @drag-leave="emit('dragLeave')"
        @drop="(id, e) => emit('drop', id, e)"
        @delete-folder="(id) => emit('deleteFolder', id)"
        @delete-document="(id) => emit('deleteDocument', id)"
        @create-subfolder="(id) => emit('createSubfolder', id)"
        @view-document="(doc) => emit('viewDocument', doc)"
        @rename-folder="(id, name) => emit('renameFolder', id, name)"
        @rename-document="(id, name) => emit('renameDocument', id, name)"
        @start-edit="(id) => emit('startEdit', id)"
        @cancel-edit="emit('cancelEdit')"
      />
    </template>
  </div>
</template>
