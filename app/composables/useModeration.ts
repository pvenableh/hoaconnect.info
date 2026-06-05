/**
 * useModeration — the admin/board moderation queue for reported comments.
 *
 * Lists hoa_comment_reports (with the reported comment + reporter expanded),
 * and resolves them: dismiss (keep the comment) or action (hide the comment).
 * Backed by hoa_comment_reports + the moderation fields on hoa_comments
 * (scripts/create-comments-collections.ts).
 */

export interface CommentReport {
  id: string;
  status: "open" | "reviewed" | "dismissed" | "actioned";
  reason: string;
  details?: string | null;
  resolution_note?: string | null;
  date_created?: string | null;
  reporter?: { id: string; first_name?: string; last_name?: string } | string | null;
  comment?: {
    id: string;
    body?: string | null;
    is_hidden?: boolean | null;
    target_collection?: string | null;
    target_id?: string | null;
    user_created?: { id: string; first_name?: string; last_name?: string } | string | null;
  } | string | null;
}

const REPORT_FIELDS = [
  "id",
  "status",
  "reason",
  "details",
  "resolution_note",
  "date_created",
  "reporter.id",
  "reporter.first_name",
  "reporter.last_name",
  "comment.id",
  "comment.body",
  "comment.is_hidden",
  "comment.target_collection",
  "comment.target_id",
  "comment.user_created.id",
  "comment.user_created.first_name",
  "comment.user_created.last_name",
];

export const useModeration = () => {
  const { user } = useDirectusAuth();
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { list, update } = useDirectusItems<CommentReport>("hoa_comment_reports");
  const { update: updateComment } = useDirectusItems("hoa_comments");

  const listReports = (status: "open" | "all" = "open") =>
    list({
      fields: REPORT_FIELDS,
      filter: {
        organization: { _eq: selectedOrgId.value },
        ...(status === "open" ? { status: { _eq: "open" } } : {}),
      },
      sort: ["-date_created"],
      limit: 100,
    });

  const openCount = async (): Promise<number> => {
    const rows = await list({
      fields: ["id"],
      filter: { organization: { _eq: selectedOrgId.value }, status: { _eq: "open" } },
      limit: 200,
    });
    return rows.length;
  };

  const commentId = (r: CommentReport): string | null => {
    const c = r.comment;
    return typeof c === "string" ? c : c?.id || null;
  };

  // Dismiss: leave the comment visible, mark the report handled.
  const dismiss = async (report: CommentReport, note?: string) => {
    await update(report.id, { status: "dismissed", resolution_note: note || null });
  };

  // Action: hide the reported comment and mark the report actioned.
  const actionHide = async (report: CommentReport, note?: string) => {
    const cid = commentId(report);
    if (cid) {
      await updateComment(cid, {
        is_hidden: true,
        hidden_reason: note || `Hidden after a "${report.reason}" report`,
        hidden_by: user.value?.id || null,
      });
    }
    await update(report.id, { status: "actioned", resolution_note: note || null });
  };

  return { listReports, openCount, dismiss, actionHide };
};
