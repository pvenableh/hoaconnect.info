<script setup lang="ts">
import type { CommentNode } from "~/composables/useComments";

const props = withDefaults(
  defineProps<{
    comment: CommentNode;
    targetCollection: string;
    targetId: string;
    organizationId: string | null;
    canReact?: boolean;
    canReply?: boolean;
    canPostInternal?: boolean;
    depth?: number;
  }>(),
  {
    canReact: true,
    canReply: true,
    canPostInternal: false,
    depth: 0,
  }
);

const config = useRuntimeConfig();
const { getUrl } = useDirectusFiles();
const { editComment, deleteComment, isAuthor } = useComments(
  props.targetCollection,
  () => props.targetId
);

const showReply = ref(false);
const isEditing = ref(false);
const editBody = ref("");

const author = computed(() =>
  typeof props.comment.user_created === "object" ? props.comment.user_created : null
);

const authorName = computed(() => {
  const a = author.value;
  if (!a) return "Member";
  return `${a.first_name || ""} ${a.last_name || ""}`.trim() || a.email || "Member";
});

const avatarUrl = computed(() => {
  const a = author.value;
  if (a?.avatar) return `${config.public.directus.url}/assets/${a.avatar}?key=small`;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName.value)}&background=e2e8f0&color=475569&size=48`;
});

const mine = computed(() => isAuthor(props.comment));

const formatDate = (s: string | null | undefined): string => {
  if (!s) return "";
  const d = new Date(s);
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const startEdit = () => {
  editBody.value = props.comment.body || "";
  isEditing.value = true;
};

const saveEdit = async () => {
  await editComment(props.comment.id, { body: editBody.value });
  isEditing.value = false;
};

const onDelete = async () => {
  if (confirm("Delete this comment?")) {
    await deleteComment(props.comment.id);
  }
};
</script>

<template>
  <div class="flex gap-3">
    <img :src="avatarUrl" :alt="authorName" class="w-8 h-8 rounded-full object-cover flex-shrink-0" />

    <div class="flex-1 min-w-0">
      <div
        class="rounded-2xl px-3 py-2"
        :class="comment.is_internal ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-stone-50'"
      >
        <div class="flex items-center gap-2 mb-0.5">
          <span class="text-sm font-medium text-stone-900">{{ authorName }}</span>
          <span
            v-if="comment.is_internal"
            class="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700"
          >
            <Icon name="lucide:lock" class="w-2.5 h-2.5" /> Internal
          </span>
          <span class="text-xs text-stone-400">{{ formatDate(comment.date_created) }}</span>
          <span v-if="comment.is_edited" class="text-xs text-stone-400">(edited)</span>
        </div>

        <!-- Edit mode -->
        <div v-if="isEditing" class="space-y-2">
          <ChannelsChannelEditor
            v-model="editBody"
            :organization-id="organizationId"
            :show-toolbar="false"
            @submit="saveEdit"
          />
          <div class="flex gap-2">
            <Button size="sm" class="rounded-full" @click="saveEdit">Save</Button>
            <Button size="sm" variant="ghost" class="rounded-full" @click="isEditing = false">
              Cancel
            </Button>
          </div>
        </div>

        <!-- Body -->
        <div
          v-else
          class="prose prose-sm prose-stone max-w-none text-sm text-stone-700"
          v-html="comment.body"
        />

        <!-- Attachments -->
        <div v-if="comment.attachments?.length" class="flex flex-wrap gap-1.5 mt-2">
          <a
            v-for="id in comment.attachments"
            :key="id"
            :href="getUrl(id)"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white ring-1 ring-stone-200 text-xs text-stone-600 hover:bg-stone-50"
          >
            <Icon name="lucide:paperclip" class="w-3 h-3" />
            Attachment
          </a>
        </div>
      </div>

      <!-- Actions row -->
      <div class="flex items-center gap-3 mt-1 pl-1">
        <CommentsReactionBar
          :target-collection="'hoa_comments'"
          :target-id="comment.id"
          :can-react="canReact"
        />
        <button
          v-if="canReply"
          type="button"
          class="text-xs text-stone-500 hover:text-stone-800"
          @click="showReply = !showReply"
        >
          Reply
        </button>
        <button
          v-if="mine"
          type="button"
          class="text-xs text-stone-500 hover:text-stone-800"
          @click="startEdit"
        >
          Edit
        </button>
        <button
          v-if="mine"
          type="button"
          class="text-xs text-stone-500 hover:text-red-600"
          @click="onDelete"
        >
          Delete
        </button>
      </div>

      <!-- Reply composer -->
      <div v-if="showReply" class="mt-2">
        <CommentsCommentComposer
          :target-collection="targetCollection"
          :target-id="targetId"
          :organization-id="organizationId"
          :parent-comment="comment.id"
          :can-post-internal="canPostInternal"
          compact
          placeholder="Write a reply…"
          @posted="showReply = false"
        />
      </div>

      <!-- Nested replies -->
      <div v-if="comment.replies?.length" class="mt-3 space-y-3 pl-2 border-l border-stone-100">
        <CommentsCommentItem
          v-for="reply in comment.replies"
          :key="reply.id"
          :comment="reply"
          :target-collection="targetCollection"
          :target-id="targetId"
          :organization-id="organizationId"
          :can-react="canReact"
          :can-reply="canReply"
          :can-post-internal="canPostInternal"
          :depth="depth + 1"
        />
      </div>
    </div>
  </div>
</template>
