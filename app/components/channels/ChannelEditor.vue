<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onMounted } from "vue";
import { Editor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Mention } from "@tiptap/extension-mention";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { DirectusUser } from "~~/types/directus";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    showToolbar?: boolean;
    organizationId?: string | null;
    channelId?: string | null;
  }>(),
  {
    modelValue: "",
    placeholder: "Type a message... Use @ to mention someone",
    disabled: false,
    showToolbar: false,
    organizationId: null,
    channelId: null,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "mention", user: MentionUser): void;
  (e: "submit"): void;
  (e: "blur", event: FocusEvent): void;
}>();

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

const editor = ref<Editor | null>(null);
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
          <div class="p-3 text-sm text-stone-500 bg-white dark:bg-stone-800 rounded-lg shadow-lg border dark:border-stone-700">
            No users found
          </div>
        `;
        return;
      }

      popup.innerHTML = `
        <div class="max-h-48 overflow-y-auto py-1 bg-white dark:bg-stone-800 rounded-lg shadow-lg border dark:border-stone-700">
          ${items
            .map(
              (item, index) => `
            <div class="px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-700 cursor-pointer flex items-center gap-2 ${
              index === selectedIndex ? "bg-stone-100 dark:bg-stone-700" : ""
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
                    ? `<div class="text-xs text-stone-500 truncate">${item.email}</div>`
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
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const result = await filesComposable.upload(file, {
          title: file.name,
        });

        if (result && typeof result === "object" && "id" in result) {
          const fileUrl = filesComposable.getUrl(result.id as string);
          if (fileUrl) {
            editor.value.chain().focus().setImage({ src: fileUrl }).run();
          }
        }
      }
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
      editor.value.commands.setContent(newValue, false);
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
      class="border rounded-lg overflow-hidden bg-white dark:bg-stone-900 transition-all"
      :class="[
        editor.isFocused
          ? 'border-primary ring-1 ring-primary/20'
          : 'border-stone-200 dark:border-stone-700',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ]"
    >
      <!-- Toolbar (optional) -->
      <div
        v-if="showToolbar"
        class="flex items-center gap-0.5 p-1.5 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
      >
        <Button
          v-for="button in toolbarButtons"
          :key="button.command"
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 w-7 p-0"
          :class="{ 'bg-stone-200 dark:bg-stone-600': editor.isActive(button.command) }"
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
          accept="image/*"
          multiple
          class="hidden"
          @change="handleFileUpload"
        />
      </div>

      <!-- Editor Content -->
      <EditorContent :editor="editor" class="channel-editor-content" />

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
          accept="image/*"
          multiple
          class="hidden"
          @change="handleFileUpload"
        />
      </div>
    </div>

    <!-- Mentions Portal -->
    <div ref="mentionsPortal" class="mentions-portal" />
  </div>
</template>

<style>
@reference "tailwindcss";

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
  @apply text-stone-400 float-left h-0 pointer-events-none;
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
