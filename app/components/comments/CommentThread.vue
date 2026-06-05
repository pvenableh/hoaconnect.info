<script setup lang="ts">
import {
  getCommentCapability,
  can,
  type CommentViewerContext,
} from "~/config/commentCapabilities";

/**
 * Drop-in conversation for any entity. Provide the target and a viewer context
 * (board / member / participant) and it renders the threaded comments + a
 * composer, gated by app/config/commentCapabilities.ts.
 */
const props = withDefaults(
  defineProps<{
    targetCollection: string;
    targetId: string;
    organizationId: string | null;
    /** is the viewer a board member / HOA admin */
    isBoard?: boolean;
    /** is the viewer an active member of the org */
    isMember?: boolean;
    /** is the viewer a participant on this specific record */
    isParticipant?: boolean;
    title?: string;
  }>(),
  {
    isBoard: false,
    isMember: true,
    isParticipant: false,
    title: "Comments",
  }
);

const { threaded, isLoading, commentCount } = useComments(
  props.targetCollection,
  () => props.targetId
);

const cap = computed(() => getCommentCapability(props.targetCollection));
const viewer = computed<CommentViewerContext>(() => ({
  isBoard: props.isBoard,
  isMember: props.isMember,
  isParticipant: props.isParticipant,
}));

const canComment = computed(() => can(cap.value.comment, viewer.value));
const canReact = computed(() => can(cap.value.react, viewer.value));
const canPostInternal = computed(() => can(cap.value.internal, viewer.value));

// Members never see internal or moderator-hidden comments; board sees all
// (hidden ones render as a reveal-able placeholder).
const visibleThread = computed(() =>
  props.isBoard
    ? threaded.value
    : threaded.value.filter((c) => !c.is_internal && !c.is_hidden)
);
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center gap-2">
      <Icon name="lucide:message-circle" class="w-4 h-4 text-stone-500" />
      <h3 class="font-semibold text-stone-900">{{ title }}</h3>
      <span v-if="commentCount" class="text-sm text-stone-400">{{ commentCount }}</span>
    </div>

    <!-- Composer -->
    <CommentsCommentComposer
      v-if="canComment"
      :target-collection="targetCollection"
      :target-id="targetId"
      :organization-id="organizationId"
      :can-post-internal="canPostInternal"
    />
    <p v-else class="text-sm text-stone-400 italic">
      Comments are read-only for your role on this item.
    </p>

    <!-- Loading -->
    <div v-if="isLoading" class="py-6 flex justify-center">
      <div class="spinner-ios" />
    </div>

    <!-- Thread -->
    <div v-else-if="visibleThread.length" class="space-y-4">
      <CommentsCommentItem
        v-for="comment in visibleThread"
        :key="comment.id"
        :comment="comment"
        :target-collection="targetCollection"
        :target-id="targetId"
        :organization-id="organizationId"
        :can-react="canReact"
        :can-reply="canComment"
        :can-post-internal="canPostInternal"
        :can-moderate="isBoard"
      />
    </div>

    <p v-else class="text-sm text-stone-400 py-4 text-center">
      No comments yet. Start the conversation.
    </p>
  </section>
</template>
