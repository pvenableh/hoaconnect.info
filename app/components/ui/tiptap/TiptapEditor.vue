<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import type { DirectusFile, DirectusFolder } from "~~/types/directus";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    editable?: boolean;
    folderId?: string | null;
  }>(),
  {
    modelValue: "",
    placeholder: "Start typing...",
    editable: true,
    folderId: null,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const config = useRuntimeConfig();
const filesComposable = useDirectusFiles();
const foldersComposable = useDirectusFolders();

const editor = useEditor({
  content: props.modelValue,
  editable: props.editable,
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
    Underline,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: "text-primary underline",
      },
    }),
    TextStyle,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: {
        class: "tiptap-image",
      },
    }),
  ],
  onUpdate: ({ editor }) => {
    emit("update:modelValue", editor.getHTML());
  },
});

// Watch for external changes to modelValue
watch(
  () => props.modelValue,
  (newValue) => {
    if (editor.value && newValue !== editor.value.getHTML()) {
      editor.value.commands.setContent(newValue, { emitUpdate: false });
    }
  }
);

// Watch for editable changes
watch(
  () => props.editable,
  (newValue) => {
    if (editor.value) {
      editor.value.setEditable(newValue);
    }
  }
);

onBeforeUnmount(() => {
  editor.value?.destroy();
});

// Link dialog state
const showLinkDialog = ref(false);
const linkUrl = ref("");

const setLink = () => {
  if (!editor.value) return;

  if (linkUrl.value === "") {
    editor.value.chain().focus().extendMarkRange("link").unsetLink().run();
  } else {
    editor.value
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: linkUrl.value })
      .run();
  }
  showLinkDialog.value = false;
  linkUrl.value = "";
};

const openLinkDialog = () => {
  if (!editor.value) return;
  const previousUrl = editor.value.getAttributes("link").href;
  linkUrl.value = previousUrl || "";
  showLinkDialog.value = true;
};

// File upload state
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);

const triggerFileUpload = () => {
  fileInput.value?.click();
};

const handleFileUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file || !editor.value) return;

  // Validate file type (images only for now)
  if (!file.type.startsWith("image/")) {
    alert("Please select an image file");
    return;
  }

  isUploading.value = true;

  try {
    // Upload to Directus with organization folder
    const result = await filesComposable.upload(file, {
      title: file.name,
      folder: props.folderId || undefined,
    });

    if (result && typeof result === "object" && "id" in result) {
      // Get the file URL
      const fileUrl = filesComposable.getUrl(result.id as string);

      if (fileUrl) {
        // Insert image into editor
        editor.value.chain().focus().setImage({ src: fileUrl }).run();
      }
    }
  } catch (error) {
    console.error("Failed to upload file:", error);
    alert("Failed to upload file. Please try again.");
  } finally {
    isUploading.value = false;
    // Reset file input
    if (input) input.value = "";
  }
};

// File browser dialog state
const showFileBrowser = ref(false);
const browseFiles = ref<DirectusFile[]>([]);
const browseFolders = ref<DirectusFolder[]>([]);
const currentBrowseFolder = ref<string | null>(null);
const folderPath = ref<{ id: string | null; name: string }[]>([]);
const isLoadingFiles = ref(false);
const fileSearchQuery = ref("");

const openFileBrowser = async () => {
  showFileBrowser.value = true;
  currentBrowseFolder.value = props.folderId || null;
  folderPath.value = [{ id: props.folderId || null, name: "Root" }];
  await loadFilesAndFolders();
};

const loadFilesAndFolders = async () => {
  isLoadingFiles.value = true;
  try {
    // Load files in current folder
    const filesResult = await filesComposable.listByFolder(
      currentBrowseFolder.value,
      {
        fields: [
          "id",
          "title",
          "filename_download",
          "type",
          "filesize",
          "width",
          "height",
        ],
        sort: ["-created_on"],
        limit: 100,
      }
    );
    browseFiles.value = (filesResult as DirectusFile[]) || [];

    // Load subfolders
    const foldersResult = await foldersComposable.getByParent(
      currentBrowseFolder.value
    );
    browseFolders.value = (foldersResult as DirectusFolder[]) || [];
  } catch (error) {
    console.error("Failed to load files:", error);
  } finally {
    isLoadingFiles.value = false;
  }
};

const navigateToFolder = async (
  folderId: string | null,
  folderName: string
) => {
  currentBrowseFolder.value = folderId;

  // Update path
  const existingIndex = folderPath.value.findIndex((f) => f.id === folderId);
  if (existingIndex >= 0) {
    // Navigating back in path
    folderPath.value = folderPath.value.slice(0, existingIndex + 1);
  } else {
    // Navigating into subfolder
    folderPath.value.push({ id: folderId, name: folderName });
  }

  await loadFilesAndFolders();
};

const selectFile = (file: DirectusFile) => {
  if (!editor.value || !file.id) return;

  const fileUrl = filesComposable.getUrl(file.id);

  if (fileUrl) {
    // Check if it's an image
    if (file.type?.startsWith("image/")) {
      editor.value.chain().focus().setImage({ src: fileUrl }).run();
    } else {
      // For non-images, insert as a link
      const fileName = file.title || file.filename_download || "Download";
      editor.value
        .chain()
        .focus()
        .insertContent(`<a href="${fileUrl}" target="_blank">${fileName}</a>`)
        .run();
    }
  }

  showFileBrowser.value = false;
};

const filteredFiles = computed(() => {
  if (!fileSearchQuery.value) return browseFiles.value;

  const query = fileSearchQuery.value.toLowerCase();
  return browseFiles.value.filter(
    (file) =>
      file.title?.toLowerCase().includes(query) ||
      file.filename_download?.toLowerCase().includes(query)
  );
});

const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageFile = (file: DirectusFile): boolean => {
  return file.type?.startsWith("image/") || false;
};

const getFileThumbnail = (file: DirectusFile): string | null => {
  if (!file.id || !isImageFile(file)) return null;
  return filesComposable.getUrl(file.id, {
    width: 80,
    height: 80,
    fit: "cover",
  });
};

const getFileIcon = (file: DirectusFile): string => {
  const type = file.type || "";
  if (type.startsWith("image/")) return "lucide:image";
  if (type.includes("pdf")) return "lucide:file-text";
  if (type.includes("word") || type.includes("document"))
    return "lucide:file-text";
  if (type.includes("excel") || type.includes("spreadsheet"))
    return "lucide:file-spreadsheet";
  return "lucide:file";
};
</script>

<template>
  <div class="tiptap-editor border rounded-lg overflow-hidden bg-background">
    <!-- Toolbar -->
    <div
      v-if="editor"
      class="tiptap-toolbar flex flex-wrap items-center gap-0.5 p-2 border-b bg-stone-50"
    >
      <!-- Text Formatting -->
      <div class="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('bold') }"
          @click="editor.chain().focus().toggleBold().run()"
          title="Bold"
        >
          <Icon name="lucide:bold" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('italic') }"
          @click="editor.chain().focus().toggleItalic().run()"
          title="Italic"
        >
          <Icon name="lucide:italic" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('underline') }"
          @click="editor.chain().focus().toggleUnderline().run()"
          title="Underline"
        >
          <Icon name="lucide:underline" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('strike') }"
          @click="editor.chain().focus().toggleStrike().run()"
          title="Strikethrough"
        >
          <Icon name="lucide:strikethrough" class="w-4 h-4" />
        </Button>
      </div>

      <Separator orientation="vertical" class="mx-1 h-6" />

      <!-- Headings -->
      <div class="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('heading', { level: 1 }) }"
          @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
          title="Heading 1"
        >
          <Icon name="lucide:heading-1" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('heading', { level: 2 }) }"
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
          title="Heading 2"
        >
          <Icon name="lucide:heading-2" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('heading', { level: 3 }) }"
          @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
          title="Heading 3"
        >
          <Icon name="lucide:heading-3" class="w-4 h-4" />
        </Button>
      </div>

      <Separator orientation="vertical" class="mx-1 h-6" />

      <!-- Lists -->
      <div class="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('bulletList') }"
          @click="editor.chain().focus().toggleBulletList().run()"
          title="Bullet List"
        >
          <Icon name="lucide:list" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('orderedList') }"
          @click="editor.chain().focus().toggleOrderedList().run()"
          title="Numbered List"
        >
          <Icon name="lucide:list-ordered" class="w-4 h-4" />
        </Button>
      </div>

      <Separator orientation="vertical" class="mx-1 h-6" />

      <!-- Text Alignment -->
      <div class="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive({ textAlign: 'left' }) }"
          @click="editor.chain().focus().setTextAlign('left').run()"
          title="Align Left"
        >
          <Icon name="lucide:align-left" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive({ textAlign: 'center' }) }"
          @click="editor.chain().focus().setTextAlign('center').run()"
          title="Align Center"
        >
          <Icon name="lucide:align-center" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive({ textAlign: 'right' }) }"
          @click="editor.chain().focus().setTextAlign('right').run()"
          title="Align Right"
        >
          <Icon name="lucide:align-right" class="w-4 h-4" />
        </Button>
      </div>

      <Separator orientation="vertical" class="mx-1 h-6" />

      <!-- Link & Extras -->
      <div class="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('link') }"
          @click="openLinkDialog"
          title="Add Link"
        >
          <Icon name="lucide:link" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="{ 'bg-stone-200': editor.isActive('blockquote') }"
          @click="editor.chain().focus().toggleBlockquote().run()"
          title="Quote"
        >
          <Icon name="lucide:quote" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          @click="editor.chain().focus().setHorizontalRule().run()"
          title="Horizontal Rule"
        >
          <Icon name="lucide:minus" class="w-4 h-4" />
        </Button>
      </div>

      <Separator orientation="vertical" class="mx-1 h-6" />

      <!-- Image & File Upload -->
      <div class="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :disabled="isUploading"
          @click="triggerFileUpload"
          title="Upload Image"
        >
          <Icon
            v-if="isUploading"
            name="lucide:loader-2"
            class="w-4 h-4 animate-spin"
          />
          <Icon v-else name="lucide:image-plus" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          @click="openFileBrowser"
          title="Browse Files"
        >
          <Icon name="lucide:folder-open" class="w-4 h-4" />
        </Button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleFileUpload"
        />
      </div>

      <Separator orientation="vertical" class="mx-1 h-6" />

      <!-- Undo/Redo -->
      <div class="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :disabled="!editor.can().undo()"
          @click="editor.chain().focus().undo().run()"
          title="Undo"
        >
          <Icon name="lucide:undo" class="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :disabled="!editor.can().redo()"
          @click="editor.chain().focus().redo().run()"
          title="Redo"
        >
          <Icon name="lucide:redo" class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- Editor Content -->
    <EditorContent :editor="editor" class="tiptap-content" />

    <!-- Link Dialog -->
    <Dialog v-model:open="showLinkDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
          <DialogDescription>
            Enter the URL for the link. Leave empty to remove the link.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="link-url">URL</Label>
            <Input
              id="link-url"
              v-model="linkUrl"
              placeholder="https://example.com"
              @keydown.enter.prevent="setLink"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showLinkDialog = false">
            Cancel
          </Button>
          <Button @click="setLink"> Apply </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- File Browser Dialog -->
    <Dialog v-model:open="showFileBrowser">
      <DialogContent class="sm:max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Browse Files</DialogTitle>
          <DialogDescription>
            Select a file to insert into your email. Images will be embedded,
            other files will be inserted as links.
          </DialogDescription>
        </DialogHeader>

        <!-- Breadcrumb Navigation -->
        <div class="flex items-center gap-1 text-sm border-b pb-2">
          <template v-for="(folder, index) in folderPath" :key="folder.id">
            <button
              type="button"
              class="hover:text-primary hover:underline"
              :class="{ 'font-medium': index === folderPath.length - 1 }"
              @click="navigateToFolder(folder.id, folder.name)"
            >
              {{ folder.name }}
            </button>
            <Icon
              v-if="index < folderPath.length - 1"
              name="lucide:chevron-right"
              class="w-4 h-4 text-stone-400"
            />
          </template>
        </div>

        <!-- Search -->
        <div class="relative">
          <Icon
            name="lucide:search"
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400"
          />
          <Input
            v-model="fileSearchQuery"
            placeholder="Search files..."
            class="pl-9"
          />
        </div>

        <!-- File Grid -->
        <div class="flex-1 overflow-y-auto min-h-[300px]">
          <div
            v-if="isLoadingFiles"
            class="flex items-center justify-center h-full"
          >
            <Icon
              name="lucide:loader-2"
              class="w-8 h-8 animate-spin text-stone-400"
            />
          </div>

          <div
            v-else-if="browseFolders.length === 0 && filteredFiles.length === 0"
            class="flex flex-col items-center justify-center h-full text-stone-500"
          >
            <Icon name="lucide:folder-x" class="w-12 h-12 mb-2" />
            <p>No files found in this folder</p>
          </div>

          <div
            v-else
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1"
          >
            <!-- Folders -->
            <button
              v-for="folder in browseFolders"
              :key="folder.id"
              type="button"
              class="flex flex-col items-center p-3 rounded-lg border hover:bg-stone-50 hover:border-stone-300 transition-colors"
              @click="navigateToFolder(folder.id, folder.name || 'Folder')"
            >
              <Icon
                name="lucide:folder"
                class="w-10 h-10 text-amber-500 mb-2"
              />
              <span class="text-sm text-center truncate w-full">
                {{ folder.name || "Folder" }}
              </span>
            </button>

            <!-- Files -->
            <button
              v-for="file in filteredFiles"
              :key="file.id"
              type="button"
              class="flex flex-col items-center p-3 rounded-lg border hover:bg-stone-50 hover:border-primary transition-colors group"
              @click="selectFile(file)"
            >
              <!-- Thumbnail or Icon -->
              <div
                class="w-16 h-16 mb-2 flex items-center justify-center rounded overflow-hidden bg-stone-100"
              >
                <img
                  v-if="getFileThumbnail(file)"
                  :src="getFileThumbnail(file)!"
                  :alt="file.title || file.filename_download || ''"
                  class="w-full h-full object-cover"
                />
                <Icon
                  v-else
                  :name="getFileIcon(file)"
                  class="w-8 h-8 text-stone-400"
                />
              </div>
              <span
                class="text-sm text-center truncate w-full group-hover:text-primary"
              >
                {{ file.title || file.filename_download || "File" }}
              </span>
              <span class="text-xs text-stone-400">
                {{ formatFileSize(file.filesize) }}
              </span>
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showFileBrowser = false">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style>
@reference 'tailwindcss';
.tiptap-content .tiptap {
  @apply p-4 min-h-[200px] focus:outline-none;
}

.tiptap-content .tiptap p.is-editor-empty:first-child::before {
  @apply text-stone-400 float-left h-0 pointer-events-none;
  content: attr(data-placeholder);
}

.tiptap-content .tiptap h1 {
  @apply text-2xl font-bold mb-4;
}

.tiptap-content .tiptap h2 {
  @apply text-xl font-bold mb-3;
}

.tiptap-content .tiptap h3 {
  @apply text-lg font-bold mb-2;
}

.tiptap-content .tiptap p {
  @apply mb-2;
}

.tiptap-content .tiptap ul {
  @apply list-disc ml-6 mb-2;
}

.tiptap-content .tiptap ol {
  @apply list-decimal ml-6 mb-2;
}

.tiptap-content .tiptap blockquote {
  @apply border-l-4 border-stone-300 pl-4 italic text-stone-600 my-4;
}

.tiptap-content .tiptap hr {
  @apply my-4 border-stone-200;
}

.tiptap-content .tiptap a {
  @apply text-primary underline cursor-pointer;
}

.tiptap-content .tiptap strong {
  @apply font-bold;
}

.tiptap-content .tiptap em {
  @apply italic;
}

.tiptap-content .tiptap u {
  @apply underline;
}

.tiptap-content .tiptap s {
  @apply line-through;
}

.tiptap-content .tiptap img.tiptap-image {
  @apply max-w-full h-auto rounded-lg my-4;
}

.tiptap-content .tiptap img.ProseMirror-selectednode {
  @apply outline outline-2 outline-primary outline-offset-2;
}
</style>
