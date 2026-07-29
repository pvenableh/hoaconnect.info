// The HITL action model — the catalog of things the assistant may PROPOSE, and
// the trust-dial logic that decides whether a proposal auto-executes or waits
// for a human. Pure and framework-free so the money/consequence-sensitive rules
// (especially "outbound always needs approval") are unit-testable in isolation.
//
// Nothing here executes anything — it's the classification layer. The server's
// proposal writer + approval routes (built in Phase 4 proper) consume it. See
// docs/plan-earnest-parity-upgrade.md, Phase 4.

export type ActionRisk = "low" | "medium" | "high";
export type ActionCategory = "internal" | "record_update" | "scheduling" | "comms";

export interface ActionDef {
  /** Stable key — also the tool name the model calls. */
  key: string;
  /** Human label for the proposal card. */
  label: string;
  category: ActionCategory;
  risk: ActionRisk;
  /**
   * Whether this action leaves the building — reaches residents, the board, or
   * anyone outside. Outbound actions ALWAYS require explicit human approval,
   * regardless of trust tier (a hard safety cap, matching Peter's directive).
   */
  outbound: boolean;
  /** One-line description shown on the proposal + used in the tool schema. */
  description: string;
}

/**
 * The proposable actions, across the four categories Peter selected. This is the
 * catalog only — each action's executable handler + input schema is wired in
 * Phase 4 proper. Order is roughly safest → most consequential.
 */
export const ACTION_CATALOG: readonly ActionDef[] = [
  // ── internal (nothing leaves the building) ────────────────────────────────
  { key: "create_task", label: "Create a task", category: "internal", risk: "low", outbound: false, description: "Add an internal task (optionally on a project or request)." },
  { key: "add_comment", label: "Add an internal note", category: "internal", risk: "low", outbound: false, description: "Post an internal (board-only) note/comment on a record." },
  { key: "create_request", label: "Create a request/ticket", category: "internal", risk: "low", outbound: false, description: "Open a new maintenance/complaint/ARC request as a draft." },

  // ── record updates (changes data, stays internal) ─────────────────────────
  { key: "update_request_status", label: "Update a request's status", category: "record_update", risk: "medium", outbound: false, description: "Change a request/ticket's status." },
  { key: "assign_request", label: "Assign a request", category: "record_update", risk: "medium", outbound: false, description: "Assign a request/ticket to a staff member." },
  { key: "update_member_field", label: "Update a member field", category: "record_update", risk: "medium", outbound: false, description: "Update a member's contact or profile field." },
  { key: "log_violation", label: "Log a violation", category: "record_update", risk: "medium", outbound: false, description: "Record a violation against a member/unit as a draft." },
  { key: "assign_vendor", label: "Assign a vendor", category: "record_update", risk: "medium", outbound: false, description: "Attach a vendor to a project." },

  // ── scheduling (internal but time-sensitive) ──────────────────────────────
  { key: "schedule_meeting", label: "Schedule a meeting", category: "scheduling", risk: "medium", outbound: false, description: "Create a meeting (draft/unpublished) with date and agenda." },
  { key: "set_due_date", label: "Set a due date", category: "scheduling", risk: "low", outbound: false, description: "Set or change a due date on a task/request/project." },

  // ── comms (OUTBOUND — always require approval) ─────────────────────────────
  { key: "send_email", label: "Send an email", category: "comms", risk: "high", outbound: true, description: "Send an email to residents/members (drafted for review first)." },
  { key: "post_announcement", label: "Post an announcement", category: "comms", risk: "high", outbound: true, description: "Publish an announcement to the community feed." },
  { key: "notify_board", label: "Notify the board", category: "comms", risk: "high", outbound: true, description: "Send a notification to the board members." },
] as const;

export function actionByKey(key: string): ActionDef | undefined {
  return ACTION_CATALOG.find((a) => a.key === key);
}

/**
 * The trust dial. Higher tiers auto-approve more of the LOW-consequence,
 * internal work; outbound actions are never auto-approved at any tier.
 *   0 — everything requires approval (the default, per Peter)
 *   1 — auto-approve low-risk internal actions (create task/note)
 *   2 — auto-approve any non-outbound action up to medium risk
 *   3 — auto-approve any non-outbound action
 */
export type AutonomyTier = 0 | 1 | 2 | 3;

/** The default per-org autonomy — the safest setting. */
export const DEFAULT_AUTONOMY_TIER: AutonomyTier = 0;

/** The trust-dial ladder — label + one-line blurb per tier, for the dial UI. */
export const AUTONOMY_TIERS: { tier: AutonomyTier; label: string; blurb: string }[] = [
  { tier: 0, label: "Ask me everything", blurb: "The assistant proposes; nothing happens until you approve it." },
  { tier: 1, label: "Handle small tasks", blurb: "Auto-runs low-risk internal actions (create a task or note). Everything else waits." },
  { tier: 2, label: "Handle internal work", blurb: "Auto-runs internal record changes too. Resident/board-facing actions still wait." },
  { tier: 3, label: "Full internal autonomy", blurb: "Auto-runs any internal action. Anything outbound always waits for you." },
];

/** Coerce any value into a valid tier (0–3), defaulting to 0. */
export function clampAutonomyTier(v: unknown): AutonomyTier {
  const n = Math.trunc(Number(v));
  if (n >= 3) return 3;
  if (n === 2) return 2;
  if (n === 1) return 1;
  return 0;
}

/**
 * Whether a proposed action may auto-execute at the given trust tier. Outbound
 * (resident/board-facing) actions ALWAYS return false — a hard cap that no tier
 * overrides. Unknown actions never auto-approve.
 */
export function shouldAutoApprove(action: ActionDef | string, tier: AutonomyTier): boolean {
  const def = typeof action === "string" ? actionByKey(action) : action;
  if (!def) return false;
  if (def.outbound) return false; // hard cap — never auto-send outward
  if (tier <= 0) return false;
  if (tier === 1) return def.category === "internal" && def.risk === "low";
  if (tier === 2) return def.risk !== "high";
  return true; // tier 3 — any non-outbound action
}
