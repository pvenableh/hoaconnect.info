<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onMounted } from "vue";
import { Editor, EditorContent, Extension } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Mention } from "@tiptap/extension-mention";
import { Plugin } from "@tiptap/pm/state";
import type { DirectusUser } from "#core/types/directus";
import type { PickedFile, StorageSource } from "#core/app/composables/useOrgStorage";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    showToolbar?: boolean;
    organizationId?: string | null;
    channelId?: string | null;
    // Opt-in: when true, accept ANY file type. Non-image files are uploaded and
    // their ids emitted via update:attachments (stored in the row's attachments
    // JSON), instead of being inlined. Images still inline as before. Channels
    // leave this off → image-only behaviour is unchanged.
    allowFileAttachments?: boolean;
    accept?: string;
    attachments?: string[];
    // When set, uploads are routed into the org's matching Uploads subfolder
    // (comment → Uploads/Comments, message → Uploads/Messages, …) and the
    // "attach from library" picker is offered.
    uploadSource?: StorageSource | null;
  }>(),
  {
    modelValue: "",
    placeholder: "Type a message... Use @ to mention someone",
    disabled: false,
    showToolbar: false,
    organizationId: null,
    channelId: null,
    allowFileAttachments: false,
    accept: "",
    attachments: () => [],
    uploadSource: null,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:attachments", ids: string[]): void;
  (e: "mention", user: MentionUser): void;
  (e: "submit"): void;
  (e: "blur", event: FocusEvent): void;
}>();

// File input accept attribute: explicit prop wins, else any file when
// attachments are allowed, else images only (channels default).
const acceptAttr = computed(
  () => props.accept || (props.allowFileAttachments ? "*/*" : "image/*")
);

interface MentionUser {
  id: string;
  label: string;
  email?: string;
  avatar?: string | null;
}

const config = useRuntimeConfig();
const { user: currentUser } = useDirectusAuth();
const { list: listMembers } = useDirectusItems("hoa_members");
const filesComposable = useDirectusFiles();
const orgStorage = useOrgStorage();

// Upload a single file, routing to the org's Uploads subfolder when a
// uploadSource is set, else falling back to a plain upload.
const uploadOne = async (file: File) => {
  if (props.uploadSource) {
    return await orgStorage.upload(file, { source: props.uploadSource, title: file.name });
  }
  return await filesComposable.upload(file, { title: file.name });
};

// Append picked library files to the attachments array.
const onLibraryPicked = (files: PickedFile[]) => {
  const ids = files.map((f) => f.id);
  if (ids.length) emit("update:attachments", [...props.attachments, ...ids]);
};

const editor = ref<Editor | null>(null);
const editorInstance = computed(() => editor.value as unknown as Editor);
const mentionsPortal = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);

// Mention suggestion configuration
const mentionSuggestion = {
  char: "@",
  items: async ({ query }: { query: string }): Promise<MentionUser[]> => {
    if (!props.organizationId) return [];

    try {
      // Fetch members from the organization who can be mentioned
      const members = await listMembers({
        fields: [
          "id",
          "user.id",
          "user.first_name",
          "user.last_name",
          "user.email",
          "user.avatar",
        ],
        filter: {
          _and: [
            { organization: { _eq: props.organizationId } },
            { status: { _eq: "active" } },
            // Exclude current user
            ...(currentUser.value?.id
              ? [{ user: { id: { _neq: currentUser.value.id } } }]
              : []),
          ],
        },
        limit: 20,
      });

      // Transform to mention format and filter by query
      const users = (members as any[])
        .filter((m) => m.user)
        .map((m) => ({
          id: m.user.id,
          label: `${m.user.first_name || ""} ${m.user.last_name || ""}`.trim(),
          email: m.user.email,
          avatar: m.user.avatar
            ? `${config.public.directus.url}/assets/${m.user.avatar}?key=small`
            : null,
        }))
        .filter((u) =>
          u.label.toLowerCase().includes(query.toLowerCase())
        );

      return users;
    } catch (error) {
      console.error("Error fetching mentionable users:", error);
      return [];
    }
  },
  render: () => {
    let popup: HTMLElement | null = null;
    let selectedIndex = 0;
    let mentionRange: any = null;
    let currentItems: MentionUser[] = [];
    let currentClientRect: (() => DOMRect) | null = null;

    const positionPopup = (coords: DOMRect) => {
      if (!popup || !mentionsPortal.value) return;

      const editorRect = mentionsPortal.value.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      let left = coords.left - editorRect.left;
      let top = coords.bottom - editorRect.top;

      // Position above if not enough space below
      if (coords.bottom + 200 > viewportHeight) {
        top = coords.top - editorRect.top - (popup.offsetHeight || 200);
      }

      // Keep within bounds
      const maxLeft = editorRect.width - (popup.offsetWidth || 256);
      left = Math.max(0, Math.min(left, maxLeft));

      popup.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    };

    const renderItems = (items: MentionUser[]) => {
      currentItems = items;
      if (!popup) return;

      if (items.length === 0) {
        popup.innerHTML = `
          <div class="p-3 text-sm t-text-muted t-bg-elevated rounded-lg shadow-lg border t-border">
            No users found
          </div>
        `;
        return;
      }

      popup.innerHTML = `
        <div class="max-h-48 overflow-y-auto py-1 t-bg-elevated rounded-lg shadow-lg border t-border">
          ${items
            .map(
              (item, index) => `
            <div class="px-3 py-2 hover:t-bg-subtle cursor-pointer flex items-center gap-2 ${
              index === selectedIndex ? "t-bg-subtle" : ""
            }" data-index="${index}">
              <img src="${
                item.avatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  item.label
                )}&background=e2e8f0&color=475569&size=32`
              }"
                class="w-8 h-8 rounded-full object-cover" alt="${item.label}">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">${item.label}</div>
                ${
                  item.email
                    ? `<div class="text-xs t-text-muted truncate">${item.email}</div>`
                    : ""
                }
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `;

      if (currentClientRect) {
        positionPopup(currentClientRect());
      }
    };

    const selectItem = (index: number) => {
      const selectedItem = currentItems[index];
      if (selectedItem && editor.value) {
        editor.value
          .chain()
          .focus()
          .deleteRange(mentionRange)
          .insertContentAt(mentionRange.from, [
            {
              type: "mention",
              attrs: {
                id: selectedItem.id,
                label: selectedItem.label,
              },
            },
            { type: "text", text: " " },
          ])
          .run();

        emit("mention", selectedItem);
        popup?.remove();
        popup = null;
      }
    };

    return {
      onStart: ({ items, clientRect, range }: any) => {
        selectedIndex = 0;
        mentionRange = range;
        currentClientRect = clientRect;

        if (!popup) {
          popup = document.createElement("div");
          popup.classList.add("mentions-menu");
          mentionsPortal.value?.appendChild(popup);

          popup.addEventListener("click", (e) => {
            const item = (e.target as HTMLElement).closest("[data-index]");
            if (item) {
              const index = parseInt(
                (item as HTMLElement).dataset.index || "0"
              );
              selectItem(index);
            }
          });
        }

        renderItems(items);
        const coords = clientRect?.();
        if (coords) positionPopup(coords);
      },

      onUpdate: ({ items, clientRect, range }: any) => {
        selectedIndex = 0;
        mentionRange = range;
        currentClientRect = clientRect;
        renderItems(items);
        const coords = clientRect?.();
        if (coords) positionPopup(coords);
      },

      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (!popup || currentItems.length === 0) return false;

        if (event.key === "ArrowUp") {
          event.preventDefault();
          selectedIndex =
            (selectedIndex - 1 + currentItems.length) % currentItems.length;
          renderItems(currentItems);
          return true;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          selectedIndex = (selectedIndex + 1) % currentItems.length;
          renderItems(currentItems);
          return true;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          selectItem(selectedIndex);
          return true;
        }

        if (event.key === "Escape") {
          popup?.remove();
          popup = null;
          return true;
        }

        return false;
      },

      onExit: () => {
        popup?.remove();
        popup = null;
        mentionRange = null;
        currentItems = [];
        selectedIndex = 0;
        currentClientRect = null;
      },
    };
  },
};

// File upload extension
const FileUpload = Extension.create({
  name: "fileUpload",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDrop: (view, event) => {
            const hasFiles = event.dataTransfer?.files?.length;
            if (!hasFiles) return false;
            event.preventDefault();
            handleFiles(Array.from(event.dataTransfer.files));
            return true;
          },
          handlePaste: (view, event) => {
            const hasFiles = event.clipboardData?.files?.length;
            if (!hasFiles) return false;
            event.preventDefault();
            handleFiles(Array.from(event.clipboardData.files));
            return true;
          },
        },
      }),
    ];
  },
});

// Handle file uploads
const handleFiles = async (files: File[]) => {
  if (!files.length || !editor.value) return;

  isUploading.value = true;

  try {
    const newAttachmentIds: string[] = [];
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const result = await uploadOne(file);

        if (result && typeof result === "object" && "id" in result) {
          const fileUrl = filesComposable.getUrl(result.id as string);
          if (fileUrl) {
            editor.value.chain().focus().setImage({ src: fileUrl }).run();
          }
        }
      } else if (props.allowFileAttachments) {
        // Non-image file (PDF, docx, …): upload and collect its id for the
        // attachments array rather than inlining it into the HTML.
        const result = await uploadOne(file);
        if (result && typeof result === "object" && "id" in result) {
          newAttachmentIds.push(result.id as string);
        }
      }
    }
    if (newAttachmentIds.length) {
      emit("update:attachments", [...props.attachments, ...newAttachmentIds]);
    }
  } catch (error) {
    console.error("Upload failed:", error);
  } finally {
    isUploading.value = false;
  }
};

const handleFileUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  await handleFiles(files);
  input.value = "";
};

// Toolbar buttons
const toolbarButtons = computed(() => [
  {
    icon: "lucide:bold",
    command: "bold",
    action: () => editor.value?.chain().focus().toggleBold().run(),
  },
  {
    icon: "lucide:italic",
    command: "italic",
    action: () => editor.value?.chain().focus().toggleItalic().run(),
  },
  {
    icon: "lucide:strikethrough",
    command: "strike",
    action: () => editor.value?.chain().focus().toggleStrike().run(),
  },
  {
    icon: "lucide:list",
    command: "bulletList",
    action: () => editor.value?.chain().focus().toggleBulletList().run(),
  },
  {
    icon: "lucide:list-ordered",
    command: "orderedList",
    action: () => editor.value?.chain().focus().toggleOrderedList().run(),
  },
]);

// Initialize editor
onMounted(() => {
  editor.value = new Editor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Placeholder.configure({
        placeholder: props.placeholder,
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
          class: "text-primary underline",
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: mentionSuggestion,
      }),
      FileUpload,
    ],
    content: props.modelValue,
    editable: !props.disabled,
    onUpdate: ({ editor }) => {
      emit("update:modelValue", editor.getHTML());
    },
    onBlur: ({ event }) => {
      emit("blur", event);
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        // Submit on Enter (without shift)
        if (event.key === "Enter" && !event.shiftKey) {
          // Don't submit if mention popup is open
          const mentionPopup = mentionsPortal.value?.querySelector(".mentions-menu");
          if (mentionPopup) return false;

          event.preventDefault();
          emit("submit");
          return true;
        }
        return false;
      },
    },
  });
});

// Watch for external value changes
watch(
  () => props.modelValue,
  (newValue) => {
    if (editor.value && newValue !== editor.value.getHTML()) {
      editor.value.commands.setContent(newValue);
    }
  }
);

// Watch for disabled changes
watch(
  () => props.disabled,
  (newValue) => {
    editor.value?.setEditable(!newValue);
  }
);

onBeforeUnmount(() => {
  editor.value?.destroy();
});

// Expose methods
defineExpose({
  focus: () => editor.value?.commands.focus(),
  clear: () => editor.value?.commands.clearContent(),
});
</script>

<template>
  <div class="channel-editor relative">
    <div
      v-if="editor"
      class="border rounded-lg overflow-hidden t-bg-elevated transition-all"
      :class="[
        editor.isFocused
          ? 'border-primary ring-1 ring-primary/20'
          : 't-border',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ]"
    >
      <!-- Toolbar (optional) -->
      <div
        v-if="showToolbar"
        class="flex items-center gap-0.5 p-1.5 border-b t-border t-bg-subtle"
      >
        <Button
          v-for="button in toolbarButtons"
          :key="button.command"
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 w-7 p-0"
          :class="{ 't-bg-subtle': editor.isActive(button.command) }"
          @click="button.action"
        >
          <Icon :name="button.icon" class="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" class="mx-1 h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 w-7 p-0"
          :disabled="isUploading"
          @click="fileInput?.click()"
        >
          <Icon
            v-if="isUploading"
            name="lucide:loader-2"
            class="w-4 h-4 animate-spin"
          />
          <Icon v-else name="lucide:paperclip" class="w-4 h-4" />
        </Button>

        <input
          ref="fileInput"
          type="file"
          :accept="acceptAttr"
          multiple
          class="hidden"
          @change="handleFileUpload"
        />

        <StorageFilePickerButton
          v-if="allowFileAttachments && uploadSource"
          :source="uploadSource"
          multiple
          label=""
          icon-only
          icon="lucide:folder-open"
          title="Attach from library"
          class="inline-flex"
          @select="onLibraryPicked"
        />
      </div>

      <!-- Editor Content -->
      <EditorContent :editor="editorInstance" class="channel-editor-content" />

      <!-- Attachment button (when no toolbar) -->
      <div
        v-if="!showToolbar"
        class="absolute right-2 bottom-2 flex items-center gap-1"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 w-7 p-0 opacity-50 hover:opacity-100"
          :disabled="isUploading"
          @click="fileInput?.click()"
        >
          <Icon
            v-if="isUploading"
            name="lucide:loader-2"
            class="w-4 h-4 animate-spin"
          />
          <Icon v-else name="lucide:paperclip" class="w-4 h-4" />
        </Button>

        <input
          ref="fileInput"
          type="file"
          :accept="acceptAttr"
          multiple
          class="hidden"
          @change="handleFileUpload"
        />

        <StorageFilePickerButton
          v-if="allowFileAttachments && uploadSource"
          :source="uploadSource"
          multiple
          label=""
          icon-only
          icon="lucide:folder-open"
          title="Attach from library"
          class="inline-flex opacity-50 hover:opacity-100"
          @select="onLibraryPicked"
        />
      </div>
    </div>

    <!-- Mentions Portal -->
    <div ref="mentionsPortal" class="mentions-portal" />
  </div>
</template>

<style>
@reference "#core/app/assets/css/tailwind.css";

.channel-editor-content .tiptap {
  @apply p-3 min-h-[60px] max-h-[200px] overflow-y-auto focus:outline-none text-sm;
}

.channel-editor-content .tiptap p {
  @apply mb-1;
}

.channel-editor-content .tiptap p:last-child {
  @apply mb-0;
}

.channel-editor-content .tiptap p.is-editor-empty:first-child::before {
  @apply float-left h-0 pointer-events-none;
  color: var(--theme-text-muted);
  content: attr(data-placeholder);
}

.channel-editor-content .tiptap ul {
  @apply list-disc ml-4 mb-1;
}

.channel-editor-content .tiptap ol {
  @apply list-decimal ml-4 mb-1;
}

.channel-editor-content .tiptap a {
  @apply text-primary underline;
}

.channel-editor-content .tiptap img {
  @apply max-w-full h-auto rounded my-2;
}

.channel-editor-content .tiptap .mention {
  @apply bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded-md;
}

.mentions-portal {
  @apply absolute top-0 left-0 w-full h-0 pointer-events-none z-50;
}

.mentions-menu {
  @apply absolute pointer-events-auto w-64 z-50;
  transform: translate3d(0, 0, 0);
  will-change: transform;
}
</style>
