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

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    editable?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: "Start typing...",
    editable: true,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

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
  </div>
</template>

<style>
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
</style>
