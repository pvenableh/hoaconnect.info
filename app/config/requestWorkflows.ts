/**
 * Tier 2 — config-driven per-type request workflows (NO new DB tables).
 *
 * Each request type declares its states, allowed transitions, who can
 * transition, and the extra `metadata` fields it shows. A single generic
 * request UI renders from this config, which is what keeps Tier 2 cheap and
 * avoids per-type code sprawl.
 *
 * The shared lifecycle on hoa_requests.status is open / in_progress / waiting /
 * resolved / closed; a type may surface friendlier per-type state labels here
 * that still map onto a stored status value.
 */

export type RequestType = "maintenance" | "arc" | "violation" | "complaint" | "task";

/** Who may perform a transition. */
export type TransitionRole = "submitter" | "assignee" | "board" | "any";

export interface MetadataField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "currency" | "user" | "select";
  options?: { label: string; value: string }[];
  /** board/admin-only field (e.g. fine amount, internal cost estimate) */
  internal?: boolean;
}

export interface WorkflowState {
  value: string;
  label: string;
  /** maps onto the stored hoa_requests.status lifecycle */
  status: "open" | "in_progress" | "waiting" | "resolved" | "closed";
  /** terminal state (no outgoing transitions) */
  terminal?: boolean;
}

export interface WorkflowTransition {
  from: string;
  to: string;
  label: string;
  by: TransitionRole;
}

export interface RequestWorkflow {
  type: RequestType;
  label: string;
  icon: string;
  /** color accent token for badges */
  accent: string;
  /** direction: who initiates — 'member' (member submits) or 'board' (board → member) */
  initiatedBy: "member" | "board";
  initialState: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  metadata: MetadataField[];
}

export const requestWorkflows: Record<RequestType, RequestWorkflow> = {
  maintenance: {
    type: "maintenance",
    label: "Maintenance / Service",
    icon: "lucide:wrench",
    accent: "amber",
    initiatedBy: "member",
    initialState: "open",
    states: [
      { value: "open", label: "Open", status: "open" },
      { value: "assigned", label: "Assigned", status: "in_progress" },
      { value: "in_progress", label: "In Progress", status: "in_progress" },
      { value: "resolved", label: "Resolved", status: "resolved" },
      { value: "closed", label: "Closed", status: "closed", terminal: true },
    ],
    transitions: [
      { from: "open", to: "assigned", label: "Assign", by: "board" },
      { from: "assigned", to: "in_progress", label: "Start work", by: "assignee" },
      { from: "in_progress", to: "resolved", label: "Mark resolved", by: "assignee" },
      { from: "resolved", to: "closed", label: "Close", by: "board" },
      { from: "resolved", to: "in_progress", label: "Reopen", by: "board" },
    ],
    metadata: [
      { key: "location", label: "Location", type: "text" },
      { key: "vendor", label: "Vendor", type: "text", internal: true },
      { key: "scheduled_for", label: "Scheduled for", type: "date" },
      { key: "cost_estimate", label: "Cost estimate", type: "currency", internal: true },
    ],
  },

  arc: {
    type: "arc",
    label: "Architectural Review (ARC)",
    icon: "lucide:ruler",
    accent: "violet",
    initiatedBy: "member",
    initialState: "submitted",
    states: [
      { value: "submitted", label: "Submitted", status: "open" },
      { value: "under_review", label: "Under Review", status: "in_progress" },
      { value: "approved", label: "Approved", status: "resolved" },
      { value: "denied", label: "Denied", status: "resolved" },
      { value: "completed", label: "Completed", status: "closed", terminal: true },
    ],
    transitions: [
      { from: "submitted", to: "under_review", label: "Begin review", by: "board" },
      { from: "under_review", to: "approved", label: "Approve", by: "board" },
      { from: "under_review", to: "denied", label: "Deny", by: "board" },
      { from: "approved", to: "completed", label: "Mark completed", by: "board" },
    ],
    metadata: [
      { key: "improvement_type", label: "Improvement type", type: "text" },
      { key: "contractor", label: "Contractor", type: "text" },
      { key: "start_date", label: "Start date", type: "date" },
      { key: "end_date", label: "End date", type: "date" },
      { key: "committee_votes", label: "Committee votes", type: "textarea", internal: true },
    ],
  },

  violation: {
    type: "violation",
    label: "Violation",
    icon: "lucide:alert-octagon",
    accent: "red",
    initiatedBy: "board",
    initialState: "reported",
    states: [
      { value: "reported", label: "Reported", status: "open" },
      { value: "notice_sent", label: "Notice Sent", status: "in_progress" },
      { value: "cure_period", label: "Cure Period", status: "waiting" },
      { value: "escalated", label: "Escalated", status: "in_progress" },
      { value: "resolved", label: "Resolved", status: "resolved", terminal: true },
    ],
    transitions: [
      { from: "reported", to: "notice_sent", label: "Send notice", by: "board" },
      { from: "notice_sent", to: "cure_period", label: "Begin cure period", by: "board" },
      { from: "cure_period", to: "resolved", label: "Mark cured", by: "board" },
      { from: "cure_period", to: "escalated", label: "Escalate", by: "board" },
      { from: "escalated", to: "resolved", label: "Resolve", by: "board" },
    ],
    metadata: [
      { key: "rule_cited", label: "Rule cited", type: "text" },
      { key: "cure_by", label: "Cure by", type: "date" },
      { key: "fine_amount", label: "Fine amount", type: "currency", internal: true },
      { key: "notice_count", label: "Notice count", type: "number", internal: true },
    ],
  },

  complaint: {
    type: "complaint",
    label: "Complaint",
    icon: "lucide:message-square-warning",
    accent: "orange",
    initiatedBy: "member",
    initialState: "open",
    states: [
      { value: "open", label: "Open", status: "open" },
      { value: "in_progress", label: "In Progress", status: "in_progress" },
      { value: "resolved", label: "Resolved", status: "resolved" },
      { value: "closed", label: "Closed", status: "closed", terminal: true },
    ],
    transitions: [
      { from: "open", to: "in_progress", label: "Start", by: "board" },
      { from: "in_progress", to: "resolved", label: "Resolve", by: "board" },
      { from: "resolved", to: "closed", label: "Close", by: "board" },
    ],
    metadata: [{ key: "about", label: "Regarding", type: "text" }],
  },

  task: {
    type: "task",
    label: "Board Task",
    icon: "lucide:check-square",
    accent: "sky",
    initiatedBy: "board",
    initialState: "open",
    states: [
      { value: "open", label: "Open", status: "open" },
      { value: "in_progress", label: "In Progress", status: "in_progress" },
      { value: "resolved", label: "Done", status: "resolved" },
      { value: "closed", label: "Closed", status: "closed", terminal: true },
    ],
    transitions: [
      { from: "open", to: "in_progress", label: "Start", by: "assignee" },
      { from: "in_progress", to: "resolved", label: "Mark done", by: "assignee" },
      { from: "resolved", to: "closed", label: "Close", by: "board" },
    ],
    metadata: [
      { key: "meeting_id", label: "From meeting", type: "text", internal: true },
    ],
  },
};

export const requestTypeList = Object.values(requestWorkflows);

export function getWorkflow(type: string | null | undefined): RequestWorkflow {
  return requestWorkflows[(type as RequestType) || "task"] || requestWorkflows.task;
}

export function getStateMeta(type: string | null | undefined, stateValue: string | null | undefined) {
  const wf = getWorkflow(type);
  return wf.states.find((s) => s.value === stateValue) || wf.states[0];
}

/** Transitions available from the current state for a given actor role set. */
export function availableTransitions(
  type: string | null | undefined,
  currentState: string | null | undefined,
  actor: { isBoard: boolean; isSubmitter: boolean; isAssignee: boolean }
): WorkflowTransition[] {
  const wf = getWorkflow(type);
  const from = currentState || wf.initialState;
  return wf.transitions.filter((t) => {
    if (t.from !== from) return false;
    switch (t.by) {
      case "any":
        return true;
      case "board":
        return actor.isBoard;
      case "submitter":
        return actor.isSubmitter || actor.isBoard;
      case "assignee":
        return actor.isAssignee || actor.isBoard;
      default:
        return false;
    }
  });
}
