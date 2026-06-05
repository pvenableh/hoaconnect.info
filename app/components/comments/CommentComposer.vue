<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    targetCollection: string;
    targetId: string;
    organizationId: string | null;
    parentComment?: string | null;
    canPostInternal?: boolean;
    placeholder?: string;
    compact?: boolean;
  }>(),
  {
    parentComment: null,
    canPostInternal: false,
    placeholder: "Add a comment… Use @ to mention someone",
    compact: false,
  }
);

const emit = defineEmits<{ (e: "posted"): void }>();

const { createComment } = useComments(props.targetCollection, () => props.targetId);

const body = ref("");
const attachments = ref<string[]>([]);
const mentionedUsers = ref<string[]>([]);
const isInternal = ref(false);
const isSubmitting = ref(false);
const editorRef = ref<{ clear: () => void; focus: () => void } | null>(null);

const onMention = (u: { id: string }) => {
  if (u?.id && !mentionedUsers.value.includes(u.id)) {
    mentionedUsers.value.push(u.id);
  }
};

const isEmpty = computed(() => {
  const text = body.value.replace(/<[^>]*>/g, "").trim();
  return text.length === 0 && attachments.value.length === 0;
});

const submit = async () => {
  if (isEmpty.value || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    await createComment({
      body: body.value,
      parentComment: props.parentComment,
      attachments: attachments.value,
      isInternal: isInternal.value,
      mentionedUsers: mentionedUsers.value,
    });
    body.value = "";
    attachments.value = [];
    mentionedUsers.value = [];
    isInternal.value = false;
    editorRef.value?.clear();
    emit("posted");
  } catch (e) {
    console.error("Failed to post comment:", e);
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="space-y-2">
    <ChannelsChannelEditor
      ref="editorRef"
      v-model="body"
      v-model:attachments="attachments"
      :organization-id="organizationId"
      :placeholder="placeholder"
      :show-toolbar="!compact"
      allow-file-attachments
      @mention="onMention"
      @submit="submit"
    />

    <!-- Pending attachment chips -->
    <div v-if="attachments.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="id in attachments"
        :key="id"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-xs text-stone-600"
      >
        <Icon name="lucide:paperclip" class="w-3 h-3" />
        Attachment
        <button
          type="button"
          class="text-stone-400 hover:text-stone-700"
          @click="attachments = attachments.filter((a) => a !== id)"
        >
          <Icon name="lucide:x" class="w-3 h-3" />
        </button>
      </span>
    </div>

    <div class="flex items-center justify-between">
      <label
        v-if="canPostInternal"
        class="inline-flex items-center gap-1.5 text-xs text-stone-500 cursor-pointer select-none"
      >
        <input type="checkbox" v-model="isInternal" class="rounded border-stone-300" />
        <Icon name="lucide:lock" class="w-3 h-3" />
        Internal (board only)
      </label>
      <span v-else />

      <Button
        size="sm"
        class="rounded-full"
        :disabled="isEmpty || isSubmitting"
        @click="submit"
      >
        <Icon
          v-if="isSubmitting"
          name="lucide:loader-2"
          class="w-3.5 h-3.5 mr-1 animate-spin"
        />
        {{ parentComment ? "Reply" : "Comment" }}
      </Button>
    </div>
  </div>
</template>
