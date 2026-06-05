/**
 * useComments(targetCollection, targetId) — the universal comment rail.
 *
 * A comment is a channel message scoped to an arbitrary entity. This composable
 * lists threaded comments for a (target_collection, target_id) pair, and
 * creates / edits / soft-deletes them, mirroring the hoa_channel_messages flow.
 * Real-time updates ride useRealtimeSubscription, the same as channels.
 *
 * Backed by the hoa_comments collection (scripts/create-comments-collections.ts).
 */

export interface CommentUserRef {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar?: string | null;
}

export interface Comment {
  id: string;
  status: "published" | "draft" | "deleted";
  target_collection: string;
  target_id: string;
  parent_comment?: string | null;
  body?: string | null;
  attachments?: string[] | null;
  mentioned_users?: string[] | null;
  is_edited?: boolean | null;
  is_internal?: boolean | null;
  is_hidden?: boolean | null;
  hidden_reason?: string | null;
  hidden_by?: CommentUserRef | string | null;
  report_count?: number | null;
  organization?: string | null;
  user_created?: CommentUserRef | string | null;
  date_created?: string | null;
  date_updated?: string | null;
}

export interface CommentNode extends Comment {
  replies: CommentNode[];
}

const COMMENT_FIELDS = [
  "id",
  "status",
  "target_collection",
  "target_id",
  "parent_comment",
  "body",
  "attachments",
  "mentioned_users",
  "is_edited",
  "is_internal",
  "is_hidden",
  "hidden_reason",
  "report_count",
  "organization",
  "date_created",
  "date_updated",
  "user_created.id",
  "user_created.first_name",
  "user_created.last_name",
  "user_created.email",
  "user_created.avatar",
];

export const useComments = (
  targetCollection: string,
  targetId: MaybeRefOrGetter<string | null | undefined>
) => {
  const { user } = useDirectusAuth();
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { create, update } = useDirectusItems<Comment>("hoa_comments");

  const tid = computed(() => toValue(targetId));

  const filter = computed(() => ({
    target_collection: { _eq: targetCollection },
    target_id: { _eq: tid.value },
    status: { _neq: "deleted" },
  }));

  const {
    data: comments,
    isLoading,
    refresh,
    isConnected,
  } = useRealtimeSubscription<Comment>(
    "hoa_comments",
    COMMENT_FIELDS,
    filter as unknown as Record<string, any>,
    ["date_created"]
  );

  // Whether the current viewer is allowed to see internal notes is decided by
  // the caller (detail view) — but we also filter defensively here when asked.
  const visibleComments = (includeInternal: boolean) =>
    computed<Comment[]>(() =>
      (comments.value || []).filter((c) => includeInternal || !c.is_internal)
    );

  // Build a threaded tree from the flat list.
  const buildTree = (includeInternal = true): CommentNode[] => {
    const flat = (comments.value || []).filter(
      (c) => includeInternal || !c.is_internal
    );
    const byId = new Map<string, CommentNode>();
    flat.forEach((c) => byId.set(c.id, { ...c, replies: [] }));
    const roots: CommentNode[] = [];
    byId.forEach((node) => {
      const parentId =
        typeof node.parent_comment === "string" ? node.parent_comment : null;
      if (parentId && byId.has(parentId)) {
        byId.get(parentId)!.replies.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  };

  const threaded = computed(() => buildTree(true));

  const createComment = async (input: {
    body: string;
    parentComment?: string | null;
    attachments?: string[];
    isInternal?: boolean;
    mentionedUsers?: string[];
  }) => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    const payload: Partial<Comment> = {
      status: "published",
      target_collection: targetCollection,
      target_id: String(tid.value),
      parent_comment: input.parentComment || null,
      body: input.body,
      attachments: input.attachments && input.attachments.length ? input.attachments : null,
      mentioned_users:
        input.mentionedUsers && input.mentionedUsers.length ? input.mentionedUsers : null,
      is_internal: input.isInternal || false,
      organization: selectedOrgId.value,
    };
    const created = await create(payload as Comment);
    await refresh();
    return created;
  };

  const editComment = async (
    id: string,
    input: { body: string; attachments?: string[]; mentionedUsers?: string[] }
  ) => {
    const updated = await update(id, {
      body: input.body,
      attachments: input.attachments ?? null,
      mentioned_users: input.mentionedUsers ?? null,
      is_edited: true,
    } as Partial<Comment>);
    await refresh();
    return updated;
  };

  // Soft-delete (matches channel message behaviour)
  const deleteComment = async (id: string) => {
    await update(id, { status: "deleted" } as Partial<Comment>);
    await refresh();
  };

  // --- Moderation (board/admin) ---
  const hideComment = async (id: string, reason?: string) => {
    await update(id, {
      is_hidden: true,
      hidden_reason: reason || null,
      hidden_by: user.value?.id || null,
    } as Partial<Comment>);
    await refresh();
  };

  const unhideComment = async (id: string) => {
    await update(id, {
      is_hidden: false,
      hidden_reason: null,
      hidden_by: null,
    } as Partial<Comment>);
    await refresh();
  };

  // --- Reporting (any member) ---
  const reportComment = async (
    commentId: string,
    reason: string,
    details?: string
  ) => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    const { create: createReport } = useDirectusItems("hoa_comment_reports");
    await createReport({
      comment: commentId,
      reason,
      details: details || null,
      status: "open",
      organization: selectedOrgId.value,
    });
    // Best-effort denormalized bump so moderators see activity quickly.
    try {
      const target = (comments.value || []).find((c) => c.id === commentId);
      await update(commentId, {
        report_count: (target?.report_count || 0) + 1,
      } as Partial<Comment>);
    } catch {
      /* non-fatal — report row is the source of truth */
    }
    await refresh();
  };

  const isAuthor = (comment: Comment): boolean => {
    const authorId =
      typeof comment.user_created === "string"
        ? comment.user_created
        : comment.user_created?.id;
    return !!user.value?.id && authorId === user.value.id;
  };

  const commentCount = computed(
    () => (comments.value || []).filter((c) => !c.is_internal).length
  );

  return {
    comments,
    threaded,
    visibleComments,
    isLoading,
    isConnected,
    commentCount,
    refresh,
    createComment,
    editComment,
    deleteComment,
    hideComment,
    unhideComment,
    reportComment,
    isAuthor,
  };
};
