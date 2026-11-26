/**
 * What the inquiries routes write (docs/spec-delegation.md): a workflow
 * transition and a details edit, decided here from the request as it stands
 * so the caller names only where it wants to go. The same rules the browser
 * applied in `useRequests().applyTransition` and RequestDetail's "Save
 * details", now checked on the server for a helper who works the area with
 * the app's token.
 *
 * Pure: no Directus, no H3. The clock is an argument.
 */
import { availableTransitions, getStateMeta, getWorkflow } from "../../app/config/requestWorkflows";
import { isResidentStatusChange } from "../reminders/rules";

/** The fields the manage pages read, as useRequests reads them. */
export const MANAGED_REQUEST_FIELDS = [
  "id", "status", "type", "title", "description", "priority", "category", "due_date", "attachments",
  "metadata", "organization", "date_created", "date_updated",
  "submitted_by.id", "submitted_by.first_name", "submitted_by.last_name",
  "assigned_to.id", "assigned_to.first_name", "assigned_to.last_name",
  "unit.id", "member.id", "member.first_name", "member.last_name",
  "project.id", "project.title",
] as const;

export interface ManagedRequest {
  id: string;
  type?: string | null;
  status?: string | null;
  title?: string | null;
  metadata?: Record<string, any> | null;
  submitted_by?: string | { id?: string | null } | null;
  assigned_to?: string | { id?: string | null } | null;
}

const idOf = (v: ManagedRequest["submitted_by"]): string | null => (v == null ? null : typeof v === "string" ? v : (v.id ?? null));

export function currentStateOf(request: ManagedRequest): string {
  return (request.metadata?.workflow_state as string) || getWorkflow(request.type).initialState;
}

export type TransitionPlan =
  | { ok: false; reason: string }
  | {
      ok: true;
      label: string;
      patch: { status: string; metadata: Record<string, any> };
      /** The system note for the request's thread. */
      comment: string;
      /** The submitter hears from the reminder engine; the note does not also ring the bell. */
      tellsSubmitter: boolean;
    };

/**
 * Move a request to `to`, as someone who works the area (the board's moves),
 * or as its submitter or assignee where the workflow lets them. Refused when
 * no transition from the current state reaches `to` for that actor.
 */
export function planTransition(request: ManagedRequest, to: string, actorUserId: string | null, now: Date): TransitionPlan {
  const from = currentStateOf(request);
  const actor = {
    isBoard: true,
    isSubmitter: !!actorUserId && idOf(request.submitted_by) === actorUserId,
    isAssignee: !!actorUserId && idOf(request.assigned_to) === actorUserId,
  };
  const t = availableTransitions(request.type, from, actor).find((x) => x.to === to);
  if (!t) return { ok: false, reason: `This request cannot move to "${to}" from "${from}".` };
  const meta = getStateMeta(request.type, to);
  const statusChanged = meta.status !== request.status;
  return {
    ok: true,
    label: t.label,
    patch: {
      status: meta.status,
      metadata: {
        ...(request.metadata || {}),
        workflow_state: to,
        ...(statusChanged ? { status_changed_at: now.toISOString() } : {}),
      },
    },
    comment: `<p><em>${escapeHtml(t.label)} — status set to <strong>${escapeHtml(meta.label)}</strong></em></p>`,
    tellsSubmitter: statusChanged && isResidentStatusChange(request.type, meta.status),
  };
}

/**
 * The request's metadata with `edits` applied to its workflow's detail
 * fields only: workflow_state, status_changed_at and any key the workflow
 * does not list are kept as they are, whatever the body says.
 */
export function mergeDetails(request: ManagedRequest, edits: Record<string, unknown>): Record<string, any> {
  const keys = new Set(getWorkflow(request.type).metadata.map((f) => f.key));
  const next: Record<string, any> = { ...(request.metadata || {}) };
  for (const [k, v] of Object.entries(edits ?? {})) {
    if (!keys.has(k)) continue;
    next[k] = v === "" ? null : v;
  }
  return next;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
