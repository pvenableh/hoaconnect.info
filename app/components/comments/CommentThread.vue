<script setup lang="ts">
import {
  getCommentCapability,
  can,
  type CommentViewerContext,
} from "#core/app/config/commentCapabilities";
import {
  buildCommentTree,
  INTERNAL_NOTES_KEY,
  type Comment,
} from "#core/app/composables/useComments";

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
    /**
     * A route that reads (GET { notes }) and posts (POST { note }) this
     * record's internal notes, for a viewer Directus leaves them out for: a
     * helper working the area on a manage page (docs/spec-delegation.md). The
     * viewer then reads and posts internal notes as staff do; moderation
     * stays with isBoard.
     */
    internalNotesUrl?: string | null;
  }>(),
  {
    isBoard: false,
    isMember: true,
    isParticipant: false,
    title: "Comments",
    internalNotesUrl: null,
  }
);

const { user } = useDirectusAuth();
const { comments, threaded, isLoading, commentCount } = useComments(
  props.targetCollection,
  () => props.targetId
);
const { announce } = useNotifyEvent();

const authorId = (c: { user_created?: unknown }) =>
  typeof c.user_created === "string"
    ? c.user_created
    : (c.user_created as { id?: string })?.id;

// ── Internal notes through a route (internalNotesUrl) ──
const viaRoute = computed(() => !!props.internalNotesUrl);
const notes = ref<Comment[]>([]);
const loadNotes = async () => {
  if (!props.internalNotesUrl || !props.organizationId) return;
  try {
    const res = await $fetch<{ notes: Comment[] }>(props.internalNotesUrl, {
      query: { orgId: props.organizationId },
    });
    notes.value = res.notes ?? [];
  } catch (e) {
    console.error("Failed to load internal notes:", e);
  }
};
watch(() => [props.internalNotesUrl, props.organizationId, props.targetId], loadNotes, { immediate: true });
// Directus does not stream internal notes to this viewer; a new public comment
// is the moment to look for notes others added alongside it.
watch(() => (comments.value || []).length, (n, o) => {
  if (viaRoute.value && o !== undefined && n !== o) loadNotes();
});

provide(INTERNAL_NOTES_KEY, {
  refresh: loadNotes,
  post: async (input) => {
    if (!props.internalNotesUrl) throw new Error("No internal notes route");
    const { note } = await $fetch<{ note: Comment }>(props.internalNotesUrl, {
      method: "POST",
      body: { orgId: props.organizationId, ...input },
    });
    if (note?.id) {
      notes.value = [...notes.value.filter((n) => n.id !== note.id), note];
      announce("hoa_comments", note.id);
    }
    return note;
  },
});

const cap = computed(() => getCommentCapability(props.targetCollection));
const viewer = computed<CommentViewerContext>(() => ({
  isBoard: props.isBoard,
  isMember: props.isMember,
  isParticipant: props.isParticipant,
}));

const canComment = computed(() => can(cap.value.comment, viewer.value));
const canReact = computed(() => can(cap.value.react, viewer.value));
const canPostInternal = computed(() => viaRoute.value || can(cap.value.internal, viewer.value));

const byDate = (a: Comment, b: Comment) =>
  String(a.date_created ?? "").localeCompare(String(b.date_created ?? ""));

// Board sees everything (hidden rendered greyed). Members never see internal,
// and don't see others' hidden comments — but the author still sees their own.
// Through the route, the member's own view plus the record's internal notes.
const visibleThread = computed(() => {
  if (props.isBoard) return threaded.value;
  if (viaRoute.value) {
    const mine = ((comments.value || []) as Comment[]).filter(
      (c) => !c.is_internal && (!c.is_hidden || authorId(c) === user.value?.id)
    );
    const ids = new Set(mine.map((c) => c.id));
    return buildCommentTree([...mine, ...notes.value.filter((n) => !ids.has(n.id))].sort(byDate));
  }
  return threaded.value.filter(
    (c) => !c.is_internal && (!c.is_hidden || authorId(c) === user.value?.id)
  );
});
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center gap-2">
      <Icon name="lucide:message-circle" class="w-4 h-4 t-text-muted" />
      <h3 class="font-semibold t-text">{{ title }}</h3>
      <span v-if="commentCount" class="text-sm t-text-muted">{{ commentCount }}</span>
    </div>

    <!-- Composer -->
    <CommentsCommentComposer
      v-if="canComment"
      :target-collection="targetCollection"
      :target-id="targetId"
      :organization-id="organizationId"
      :can-post-internal="canPostInternal"
    />
    <p v-else class="text-sm t-text-muted italic">
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

    <p v-else class="text-sm t-text-muted py-4 text-center">
      No comments yet. Start the conversation.
    </p>
  </section>
</template>
