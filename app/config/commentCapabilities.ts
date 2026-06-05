/**
 * Who may comment / react / see-internal per target collection.
 *
 * Code-first capability map for UX affordances. The security boundary is
 * Directus permissions (see scripts/create-comments-collections.ts) — this map
 * only decides what the UI offers, never what the API allows.
 *
 * Roles resolve against the current user's HOA role + relationship to the
 * record:
 *  - 'member'        : any active member of the org
 *  - 'board'         : board member / HOA admin
 *  - 'participants'  : the record's submitter, assignee, or board/admin
 *  - 'none'          : nobody (feature off for this surface)
 */

export type CommentRole = "member" | "board" | "participants" | "none";

export interface CommentCapability {
  comment: CommentRole;
  react: CommentRole;
  /** who may post / read is_internal (board-only) notes */
  internal: CommentRole;
}

export const commentCapabilities: Record<string, CommentCapability> = {
  hoa_announcements: { comment: "member", react: "member", internal: "board" },
  hoa_documents: { comment: "board", react: "member", internal: "board" },
  hoa_meetings: { comment: "board", react: "member", internal: "board" },
  hoa_requests: { comment: "participants", react: "participants", internal: "board" },
  payment_requests: { comment: "participants", react: "none", internal: "board" },
};

/** Fallback for any surface not explicitly configured. */
export const defaultCommentCapability: CommentCapability = {
  comment: "board",
  react: "member",
  internal: "board",
};

export function getCommentCapability(targetCollection: string): CommentCapability {
  return commentCapabilities[targetCollection] || defaultCommentCapability;
}

export interface CommentViewerContext {
  /** true if the user is a board member / HOA admin */
  isBoard: boolean;
  /** true if the user is an active member of the org */
  isMember: boolean;
  /** true if the user is a participant on the specific record */
  isParticipant: boolean;
}

/** Resolve whether a viewer satisfies a capability role. */
export function can(role: CommentRole, ctx: CommentViewerContext): boolean {
  switch (role) {
    case "none":
      return false;
    case "board":
      return ctx.isBoard;
    case "member":
      return ctx.isMember || ctx.isBoard;
    case "participants":
      return ctx.isParticipant || ctx.isBoard;
    default:
      return false;
  }
}
