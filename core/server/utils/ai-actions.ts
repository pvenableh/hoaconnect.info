// The HITL action engine (Phase 4 — docs/plan-earnest-parity-upgrade.md).
//
// Everything the assistant "does" flows through here as a PROPOSAL: a pending
// ai_actions row a human (or, per the trust dial, the system) approves. There is
// no inline-execute lane — even auto-approved actions are logged as an executed
// row and are undoable. Three responsibilities:
//
//   • proposeAction()  — validate + resolve a tool call → write a `pending` row,
//                         and (only for non-outbound actions the org's tier
//                         allows) auto-run it via decideAiAction.
//   • decideAiAction() — the single approve/reject guard: loads the row, verifies
//                        the org, guards `pending`, runs the executor on approve.
//   • undoAiAction()   — revert an executed action using the undo info the
//                        executor captured (delete a created row, restore a value).
//
// Tenant isolation: callers must org-verify before decide/undo (the routes do).
// Executors use the admin client because the caller is already authorized as a
// comms actor — the same trust boundary channels/email writes already use.
//
// getTypedDirectus is auto-imported from server/utils/directus.ts.

import { createItem, readItem, readItems, updateItem, deleteItem } from "@directus/sdk";
import {
  actionByKey,
  shouldAutoApprove,
  DEFAULT_AUTONOMY_TIER,
  type ActionDef,
  type AutonomyTier,
} from "#core/shared/ai/actions";
import { isKnownAction } from "./llm/tools";

export interface ProposeContext {
  orgId: string;
  userId: string | null;
  conversationId?: string | null;
  /** What the user is looking at — used to resolve omitted target ids. */
  entityType?: string | null;
  entityId?: string | null;
  autonomyTier?: AutonomyTier;
}

export interface ProposeResult {
  success: boolean;
  summary: string;
  actionId?: string | null;
  status?: string;
  error?: string;
}

/** Undo info an executor stashes so the action can be reverted. */
type UndoInfo =
  | { kind: "delete"; collection: string; id: string }
  | { kind: "restore"; collection: string; id: string; values: Record<string, any> };

interface ExecResult {
  result: Record<string, any>;
  undo?: UndoInfo;
}

interface ExecContext {
  payload: Record<string, any>;
  orgId: string;
  userId: string | null;
}

const directus = () => getTypedDirectus();

// ── id resolution ──────────────────────────────────────────────────────────────
// Confirm a referenced row is in THIS org before we touch it (guards hallucinated
// ids and cross-tenant references). Returns the row or throws a friendly error.
async function requireOrgRow(collection: string, id: string, orgId: string, fields: string[] = ["id"]): Promise<any> {
  const rows = (await directus().request(
    (readItems as any)(collection, {
      filter: { id: { _eq: id }, organization: { _eq: orgId } },
      fields,
      limit: 1,
    })
  )) as any[];
  if (!rows?.[0]) throw new Error("That record isn't available in this association.");
  return rows[0];
}

// ── executors — the only code that writes; keyed by action_type ────────────────
const EXECUTORS: Record<string, (ctx: ExecContext) => Promise<ExecResult>> = {
  async create_task({ payload, orgId }) {
    const category = payload.request_id ? "request" : payload.project_id ? "project" : "quick";
    const created = (await directus().request(
      createItem("hoa_tasks", {
        organization: orgId,
        title: payload.title,
        description: payload.description ?? null,
        priority: payload.priority ?? null,
        due_date: payload.due_date ?? null,
        status: "new",
        category,
        project: payload.project_id ?? null,
        request: payload.request_id ?? null,
      } as any)
    )) as { id: string };
    return { result: { taskId: created.id }, undo: { kind: "delete", collection: "hoa_tasks", id: created.id } };
  },

  async add_comment({ payload, orgId }) {
    const created = (await directus().request(
      createItem("hoa_comments", {
        organization: orgId,
        target_collection: payload.target_collection,
        target_id: String(payload.target_id),
        body: payload.body,
        is_internal: payload.is_internal !== false,
        status: "published",
      } as any)
    )) as { id: string };
    return { result: { commentId: created.id }, undo: { kind: "delete", collection: "hoa_comments", id: created.id } };
  },

  async create_request({ payload, orgId }) {
    const created = (await directus().request(
      createItem("hoa_requests", {
        organization: orgId,
        title: payload.title,
        type: payload.type,
        description: payload.description ?? null,
        priority: payload.priority ?? null,
        member: payload.member_id ?? null,
        status: "open",
      } as any)
    )) as { id: string };
    return { result: { requestId: created.id }, undo: { kind: "delete", collection: "hoa_requests", id: created.id } };
  },

  async update_request_status({ payload, orgId }) {
    const prev = await requireOrgRow("hoa_requests", payload.request_id, orgId, ["id", "status"]);
    await directus().request(updateItem("hoa_requests", payload.request_id, { status: payload.status } as any));
    return {
      result: { requestId: payload.request_id, status: payload.status, previousStatus: prev.status },
      undo: { kind: "restore", collection: "hoa_requests", id: payload.request_id, values: { status: prev.status ?? null } },
    };
  },

  async assign_request({ payload, orgId }) {
    const prev = await requireOrgRow("hoa_requests", payload.request_id, orgId, ["id", "assigned_to"]);
    const users = (await directus().request(
      (readItems as any)("directus_users", {
        filter: { email: { _eq: payload.assignee_email } },
        fields: ["id", "first_name", "last_name"],
        limit: 1,
      })
    )) as any[];
    const user = users?.[0];
    if (!user) throw new Error(`No staff member found with the email ${payload.assignee_email}.`);
    await directus().request(updateItem("hoa_requests", payload.request_id, { assigned_to: user.id } as any));
    return {
      result: { requestId: payload.request_id, assignedTo: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() },
      undo: { kind: "restore", collection: "hoa_requests", id: payload.request_id, values: { assigned_to: prev.assigned_to ?? null } },
    };
  },

  async update_member_field({ payload, orgId }) {
    const ALLOWED = new Set(["phone", "email", "company"]);
    if (!ALLOWED.has(payload.field)) throw new Error(`The field "${payload.field}" can't be changed this way.`);
    const prev = await requireOrgRow("hoa_members", payload.member_id, orgId, ["id", payload.field]);
    await directus().request(updateItem("hoa_members", payload.member_id, { [payload.field]: payload.value } as any));
    return {
      result: { memberId: payload.member_id, field: payload.field, value: payload.value },
      undo: { kind: "restore", collection: "hoa_members", id: payload.member_id, values: { [payload.field]: prev[payload.field] ?? null } },
    };
  },

  async log_violation({ payload, orgId }) {
    const created = (await directus().request(
      createItem("hoa_requests", {
        organization: orgId,
        type: "violation",
        title: payload.title,
        description: payload.description ?? null,
        member: payload.member_id ?? null,
        priority: payload.priority ?? null,
        status: "open",
      } as any)
    )) as { id: string };
    return { result: { requestId: created.id }, undo: { kind: "delete", collection: "hoa_requests", id: created.id } };
  },

  async assign_vendor({ payload, orgId }) {
    await requireOrgRow("hoa_projects", payload.project_id, orgId, ["id"]);
    await requireOrgRow("hoa_vendors", payload.vendor_id, orgId, ["id"]);
    const created = (await directus().request(
      createItem("hoa_projects_vendors", {
        hoa_projects_id: payload.project_id,
        hoa_vendors_id: payload.vendor_id,
        role: payload.role ?? null,
      } as any)
    )) as { id: string };
    return { result: { linkId: created.id }, undo: { kind: "delete", collection: "hoa_projects_vendors", id: String(created.id) } };
  },

  async schedule_meeting({ payload, orgId }) {
    const type = ["board", "annual", "special", "committee"].includes(payload.type) ? payload.type : null;
    const created = (await directus().request(
      createItem("hoa_meetings", {
        organization: orgId,
        title: payload.title,
        meeting_date: payload.meeting_date ?? null,
        type,
        location: payload.location ?? null,
        agenda: payload.agenda ?? null,
        status: "scheduled",
        is_published: false,
      } as any)
    )) as { id: string };
    return { result: { meetingId: created.id }, undo: { kind: "delete", collection: "hoa_meetings", id: created.id } };
  },

  async set_due_date({ payload, orgId }) {
    const collection = payload.task_id ? "hoa_tasks" : "hoa_requests";
    const id = payload.task_id || payload.request_id;
    const prev = await requireOrgRow(collection, id, orgId, ["id", "due_date"]);
    await directus().request(updateItem(collection as any, id, { due_date: payload.due_date } as any));
    return {
      result: { collection, id, dueDate: payload.due_date, previousDueDate: prev.due_date },
      undo: { kind: "restore", collection, id, values: { due_date: prev.due_date ?? null } },
    };
  },

  // ── outbound → always create a DRAFT a human finalizes (never auto-sent) ──────
  async send_email({ payload, orgId }) {
    const created = (await directus().request(
      createItem("hoa_emails", {
        organization: orgId,
        subject: payload.subject,
        content: payload.body_html,
        email_type: "basic",
        content_mode: "visual",
        status: "draft",
        recipient_filter: ["all", "owners", "tenants"].includes(payload.audience) ? payload.audience : "all",
      } as any)
    )) as { id: string };
    return { result: { emailId: created.id }, undo: { kind: "delete", collection: "hoa_emails", id: created.id } };
  },

  async post_announcement({ payload, orgId }) {
    const created = (await directus().request(
      createItem("hoa_announcements", {
        organization: orgId,
        title: payload.title,
        content: payload.content,
        announcement_type: payload.announcement_type ?? "general",
        status: "draft",
      } as any)
    )) as { id: string };
    return { result: { announcementId: created.id }, undo: { kind: "delete", collection: "hoa_announcements", id: created.id } };
  },

  async notify_board({ payload, orgId }) {
    const created = (await directus().request(
      createItem("hoa_announcements", {
        organization: orgId,
        title: payload.subject,
        content: payload.body,
        announcement_type: "general",
        target_audience: "board members",
        status: "draft",
      } as any)
    )) as { id: string };
    return { result: { announcementId: created.id }, undo: { kind: "delete", collection: "hoa_announcements", id: created.id } };
  },
};

// ── proposal building (resolve ids, build payload + preview + title) ────────────

/** Fill omitted target ids from the focused entity so "mark this resolved" works. */
function resolveTargets(key: string, input: Record<string, any>, ctx: ProposeContext): Record<string, any> {
  const p = { ...input };
  const et = ctx.entityType;
  const eid = ctx.entityId ? String(ctx.entityId) : null;
  if (!eid) return p;
  const isReq = et === "request" || et === "violation" || et === "ticket";
  if (key === "update_request_status" && !p.request_id && isReq) p.request_id = eid;
  if (key === "assign_request" && !p.request_id && isReq) p.request_id = eid;
  if (key === "update_member_field" && !p.member_id && et === "member") p.member_id = eid;
  if (key === "assign_vendor" && !p.project_id && et === "project") p.project_id = eid;
  if (key === "assign_vendor" && !p.vendor_id && et === "vendor") p.vendor_id = eid;
  if (key === "set_due_date" && !p.task_id && !p.request_id && isReq) p.request_id = eid;
  if (key === "add_comment" && !p.target_id && isReq) {
    p.target_id = eid;
    p.target_collection = p.target_collection || "hoa_requests";
  }
  if ((key === "create_request" || key === "log_violation") && !p.member_id && et === "member") p.member_id = eid;
  if (key === "create_task" && !p.request_id && !p.project_id && isReq) p.request_id = eid;
  if (key === "create_task" && !p.project_id && !p.request_id && et === "project") p.project_id = eid;
  return p;
}

/** Human-readable one-liner for the ai_actions row + activity feed. */
function titleFor(def: ActionDef, p: Record<string, any>): string {
  switch (def.key) {
    case "create_task": return `Create task “${p.title}”`;
    case "add_comment": return "Add an internal note";
    case "create_request": return `Open ${p.type || "request"} “${p.title}”`;
    case "update_request_status": return `Set request status to ${p.status}`;
    case "assign_request": return `Assign request to ${p.assignee_email}`;
    case "update_member_field": return `Update member ${p.field}`;
    case "log_violation": return `Log violation “${p.title}”`;
    case "assign_vendor": return "Assign a vendor to the project";
    case "schedule_meeting": return `Schedule “${p.title}”`;
    case "set_due_date": return `Set due date ${p.due_date}`;
    case "send_email": return `Draft email: “${p.subject}”`;
    case "post_announcement": return `Draft announcement: “${p.title}”`;
    case "notify_board": return `Draft board note: “${p.subject}”`;
    default: return def.label;
  }
}

/** A compact, human preview object the approval card renders. */
function previewFor(def: ActionDef, p: Record<string, any>): Record<string, any> {
  const base = { kind: def.key, label: def.label };
  const clip = (s: any, n = 400) => (s == null ? "" : String(s).slice(0, n));
  switch (def.key) {
    case "create_task": return { ...base, title: p.title, description: clip(p.description), priority: p.priority, dueDate: p.due_date };
    case "add_comment": return { ...base, body: clip(p.body), isInternal: p.is_internal !== false };
    case "create_request": return { ...base, title: p.title, type: p.type, priority: p.priority, description: clip(p.description) };
    case "update_request_status": return { ...base, status: p.status };
    case "assign_request": return { ...base, assigneeEmail: p.assignee_email };
    case "update_member_field": return { ...base, field: p.field, value: clip(p.value, 120) };
    case "log_violation": return { ...base, title: p.title, priority: p.priority, description: clip(p.description) };
    case "assign_vendor": return { ...base, role: p.role };
    case "schedule_meeting": return { ...base, title: p.title, meetingDate: p.meeting_date, type: p.type, location: p.location, agenda: clip(p.agenda) };
    case "set_due_date": return { ...base, dueDate: p.due_date };
    case "send_email": return { ...base, subject: p.subject, audience: p.audience || "all", bodyHtml: clip(p.body_html, 1200), note: "Creates a reviewable draft — you send it." };
    case "post_announcement": return { ...base, title: p.title, announcementType: p.announcement_type || "general", content: clip(p.content, 1200), note: "Creates a draft — you publish it." };
    case "notify_board": return { ...base, subject: p.subject, body: clip(p.body, 1200), note: "Creates a board-targeted draft — you publish it." };
    default: return base;
  }
}

/** The entity a proposal is about (for feed grouping), best-effort. */
function entityRefFor(key: string, p: Record<string, any>, ctx: ProposeContext): { type: string | null; id: string | null } {
  if (p.request_id) return { type: "request", id: String(p.request_id) };
  if (p.member_id) return { type: "member", id: String(p.member_id) };
  if (p.project_id) return { type: "project", id: String(p.project_id) };
  if (p.task_id) return { type: "task", id: String(p.task_id) };
  if (ctx.entityType && ctx.entityId) return { type: ctx.entityType, id: String(ctx.entityId) };
  return { type: null, id: null };
}

/** Recompute the preview + title for an edited payload (used by the edit route). */
export function buildProposalDisplay(actionType: string, payload: Record<string, any>): { preview: Record<string, any>; title: string } | null {
  const def = actionByKey(actionType);
  if (!def) return null;
  return { preview: previewFor(def, payload), title: titleFor(def, payload) };
}

/** Write a pending ai_actions row. Returns the id, or null on failure (never throws). */
export async function logAiAction(row: Record<string, any>): Promise<string | null> {
  try {
    const created = (await directus().request(createItem("ai_actions", row as any))) as { id: string };
    return created?.id ?? null;
  } catch (err: any) {
    console.warn("logAiAction failed:", err?.message || err);
    return null;
  }
}

/**
 * Propose a tool call: build + validate, write a pending row, and (only for
 * non-outbound actions the org's tier allows) auto-run it. Returns a summary the
 * chat loop feeds back to the model as the tool result.
 */
export async function proposeAction(
  toolName: string,
  input: Record<string, any>,
  ctx: ProposeContext
): Promise<ProposeResult> {
  const def = actionByKey(toolName);
  if (!def || !isKnownAction(toolName)) {
    return { success: false, summary: "", error: `Unknown action "${toolName}".` };
  }

  try {
    const payload = resolveTargets(toolName, input, ctx);

    // Validate the minimum a target-bound action needs (so we don't queue a
    // proposal that's guaranteed to fail on approve).
    if ((toolName === "update_request_status" || toolName === "assign_request") && !payload.request_id) {
      return { success: false, summary: "", error: "No request in view to act on — open a request first." };
    }
    if (toolName === "update_member_field" && !payload.member_id) {
      return { success: false, summary: "", error: "No member in view to update." };
    }
    if (toolName === "assign_vendor" && (!payload.project_id || !payload.vendor_id)) {
      return { success: false, summary: "", error: "Assigning a vendor needs both a project and a vendor in context." };
    }
    if (toolName === "set_due_date" && !payload.task_id && !payload.request_id) {
      return { success: false, summary: "", error: "No task or request in view to set a due date on." };
    }

    const preview = previewFor(def, payload);
    const title = titleFor(def, payload);
    const ent = entityRefFor(toolName, payload, ctx);

    const actionId = await logAiAction({
      organization: ctx.orgId,
      action_type: toolName,
      status: "pending",
      category: def.category,
      risk: def.risk,
      outbound: def.outbound,
      payload,
      preview,
      title,
      entity_type: ent.type,
      entity_id: ent.id,
      conversation: ctx.conversationId ?? null,
      requested_by: ctx.userId ?? null,
    });

    if (!actionId) {
      return { success: false, summary: "", error: "Couldn't record the proposal." };
    }

    // Trust dial: auto-run low-risk internal actions when the org allows it.
    // Outbound actions never auto-run (shouldAutoApprove hard-caps that).
    const tier = (ctx.autonomyTier ?? DEFAULT_AUTONOMY_TIER) as AutonomyTier;
    if (shouldAutoApprove(def, tier)) {
      try {
        const decided = await decideAiAction({
          id: actionId,
          decision: "approve",
          userId: ctx.userId,
          verifyOrg: async () => {}, // proposer already scoped to this org
          orgId: ctx.orgId,
        });
        if (decided.status === "executed") {
          return {
            success: true,
            actionId,
            status: "executed",
            summary: `Done automatically (trust level ${tier}): ${title}. It's in your Review list if you want to undo it.`,
          };
        }
      } catch {
        /* auto-run failed → leave it pending for a human */
      }
    }

    return {
      success: true,
      actionId,
      status: "pending",
      summary: `Queued for your review: ${title}. Nothing has happened yet — it's waiting for you to approve it.`,
    };
  } catch (err: any) {
    return { success: false, summary: "", error: err?.message || "Could not propose the action." };
  }
}

// ── decide (approve / reject) ──────────────────────────────────────────────────

export interface DecideInput {
  id: string;
  decision: "approve" | "reject";
  userId: string | null;
  /** Confirms the row's org belongs to the caller (throws to deny). */
  verifyOrg: (orgId: string) => Promise<unknown> | unknown;
  /** When the caller already knows the org (the proposer), skip re-verify. */
  orgId?: string;
}

export interface DecideResult {
  id: string;
  status: "executed" | "rejected";
  result?: Record<string, any>;
  error?: string;
}

/**
 * The one guard both approval and auto-run go through. Loads the row, verifies
 * the org, refuses anything not `pending` (no double-execute), then rejects or
 * runs the executor. On executor failure the row is marked `failed` and the
 * error surfaces.
 */
export async function decideAiAction(input: DecideInput): Promise<DecideResult> {
  const { id, decision, userId, verifyOrg } = input;
  const row = (await directus().request(
    readItem("ai_actions", id, {
      fields: ["id", "organization", "action_type", "status", "payload"],
    })
  )) as any;
  if (!row) throw createError({ statusCode: 404, message: "Action not found" });

  const orgId = typeof row.organization === "string" ? row.organization : row.organization?.id;
  await verifyOrg(orgId);

  if (row.status !== "pending") {
    throw createError({ statusCode: 409, message: `Action already ${row.status}` });
  }

  const nowStamp = { approved_by: userId ?? null };

  if (decision === "reject") {
    await directus().request(updateItem("ai_actions", id, { status: "rejected", ...nowStamp } as any));
    return { id, status: "rejected" };
  }

  const executor = EXECUTORS[row.action_type];
  if (!executor) {
    await directus().request(
      updateItem("ai_actions", id, { status: "failed", error_message: "No executor for this action.", ...nowStamp } as any)
    );
    throw createError({ statusCode: 400, message: "This action can't be executed." });
  }

  try {
    const { result, undo } = await executor({ payload: row.payload || {}, orgId, userId });
    const stored = undo ? { ...result, _undo: undo } : result;
    await directus().request(
      updateItem("ai_actions", id, { status: "executed", result: stored, ...nowStamp } as any)
    );
    return { id, status: "executed", result: stored };
  } catch (err: any) {
    await directus().request(
      updateItem("ai_actions", id, { status: "failed", error_message: err?.message || "Execution failed", ...nowStamp } as any)
    );
    // Mark it failed, then surface the reason. proposeAction's auto-run wraps
    // this in a try/catch, so a failed auto-run simply leaves the row failed.
    throw createError({ statusCode: 422, message: err?.message || "Execution failed" });
  }
}

// ── undo ────────────────────────────────────────────────────────────────────────

/**
 * Revert an executed action using the undo info its executor captured. Deletes a
 * created row, or restores prior field values. Idempotent-ish: re-running after
 * an undo is a no-op. The row stays `executed` with `result._undone` stamped.
 */
export async function undoAiAction(input: {
  id: string;
  userId: string | null;
  verifyOrg: (orgId: string) => Promise<unknown> | unknown;
}): Promise<{ id: string; undone: boolean }> {
  const { id, verifyOrg } = input;
  const row = (await directus().request(
    readItem("ai_actions", id, { fields: ["id", "organization", "status", "result"] })
  )) as any;
  if (!row) throw createError({ statusCode: 404, message: "Action not found" });

  const orgId = typeof row.organization === "string" ? row.organization : row.organization?.id;
  await verifyOrg(orgId);

  if (row.status !== "executed") {
    throw createError({ statusCode: 409, message: "Only an executed action can be undone." });
  }
  const undo = row.result?._undo as UndoInfo | undefined;
  if (row.result?._undone) return { id, undone: true };
  if (!undo) throw createError({ statusCode: 400, message: "This action can't be undone." });

  try {
    if (undo.kind === "delete") {
      await directus().request(deleteItem(undo.collection as any, undo.id));
    } else {
      await directus().request(updateItem(undo.collection as any, undo.id, undo.values as any));
    }
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err?.message || "Undo failed" });
  }

  await directus().request(
    updateItem("ai_actions", id, { result: { ...row.result, _undone: true, _undoneAt: new Date().toISOString() } } as any)
  );
  return { id, undone: true };
}
