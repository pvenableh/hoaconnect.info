/**
 * What a change of holder writes (docs/spec-responsibilities.md, "Actions").
 * One rule for jobs and board terms: end one dated row and open another;
 * nothing is overwritten and nothing is deleted. The routes write exactly
 * what these return. Pure.
 */
import { addDays, sameTarget, targetColumns, targetOf, validateTarget, type AssigneeRow, type Target, type TargetFields } from "./holders";
import { isOffice, ROLE_KEYS, END_REASON_KEYS, type AssigneeRole, type EndReason, type Office } from "./config";

export type Plan<T> = { ok: true; plan: T } | { ok: false; status: 400 | 409; error: string };

const fail = (status: 400 | 409, error: string) => ({ ok: false as const, status, error });
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

// ── Hand-over ────────────────────────────────────────────────────────────────

export interface HandOverNext extends TargetFields {
  role?: AssigneeRole | null;
  notes?: string | null;
}

export interface HandOverPlan {
  /** The open row to end, and its new end date (the day before `effective`). */
  end: { id: string; end_date: string };
  /** The row to open from `effective`, or null when the job is left without a holder. */
  open: (Record<string, string | null> & { role: AssigneeRole; start_date: string; notes: string | null }) | null;
  target: Target | null;
}

/**
 * Hand a job over on `effective` (the next holder's first day). `current` must
 * be open and must have started before `effective`. `next` omitted: the row
 * just ends, and the job reads unassigned from `effective`.
 */
export function planHandOver(
  current: AssigneeRow & { id: string },
  next: HandOverNext | null | undefined,
  effective: string
): Plan<HandOverPlan> {
  const start = day(current.start_date);
  if (current.end_date) return fail(409, "That holder's row has already ended.");
  if (start && effective <= start) {
    return fail(409, "That holder started on or after this date. Correct the row instead.");
  }
  const end = { id: current.id, end_date: addDays(effective, -1) };
  if (!next) return { ok: true, plan: { end, open: null, target: null } };

  const t = validateTarget(next);
  if (t.ok === false) return fail(400, t.error);
  if (sameTarget(t.target, targetOf(current))) return fail(409, "They already hold it.");
  const role = (next.role && (ROLE_KEYS as string[]).includes(next.role) ? next.role : current.role) as AssigneeRole;
  return {
    ok: true,
    plan: {
      end,
      open: {
        ...targetColumns(t.target),
        role: (ROLE_KEYS as string[]).includes(role) ? role : "owner",
        start_date: effective,
        notes: next.notes?.trim() || null,
      },
      target: t.target,
    },
  };
}

// ── Board terms ──────────────────────────────────────────────────────────────

export interface TermRow {
  id: string;
  hoa_member?: unknown;
  title?: string | null;
  term_start?: string | null;
  term_end?: string | null;
  end_reason?: string | null;
  status?: string | null;
}

export type TermAction =
  | { kind: "end"; lastDay: string; reason: Exclude<EndReason, "changed_office"> }
  | { kind: "change_office"; effective: string; office: Office }
  | { kind: "correct"; patch: TermCorrection };

export interface TermCorrection {
  title?: Office;
  term_start?: string | null;
  term_end?: string | null;
  end_reason?: EndReason | null;
  message?: string | null;
  icon?: string | null;
  status?: "published" | "draft" | "archived";
}

const CORRECTABLE = ["title", "term_start", "term_end", "end_reason", "message", "icon", "status"] as const satisfies readonly (keyof TermCorrection)[];

export interface TermPlan {
  /** In-place patch to the term (End term, the end half of Change office, Correct). */
  patch: Record<string, unknown>;
  /** The term to open (Change office only), for the same member. */
  open: { title: Office; term_start: string; term_end: string | null; status: "published" } | null;
  /** True when the action ends the term, so the server freezes its holder's name. */
  ends: boolean;
}

/** End a term, change its office, or correct it in place. Never changes the member. */
export function planTermChange(term: TermRow, action: TermAction): Plan<TermPlan> {
  const start = day(term.term_start);
  if (action.kind === "end") {
    if (term.end_reason) return fail(409, "This term has already ended.");
    if (!(END_REASON_KEYS as string[]).includes(action.reason) || action.reason === ("changed_office" as string)) {
      return fail(400, "Say why the term ended.");
    }
    if (start && action.lastDay < start) return fail(409, "The last day is before the term started.");
    return { ok: true, plan: { patch: { term_end: action.lastDay, end_reason: action.reason }, open: null, ends: true } };
  }

  if (action.kind === "change_office") {
    if (term.end_reason) return fail(409, "This term has already ended.");
    if (!isOffice(action.office)) return fail(400, "Choose a board office.");
    if (action.office === term.title) return fail(409, "They already hold that office.");
    if (start && action.effective <= start) {
      return fail(409, "The term started on or after this date. Correct the term instead.");
    }
    const plannedEnd = day(term.term_end);
    const lastOld = addDays(action.effective, -1);
    if (plannedEnd && plannedEnd < lastOld) return fail(409, "The term had ended before this date.");
    return {
      ok: true,
      plan: {
        patch: { term_end: lastOld, end_reason: "changed_office" },
        open: {
          title: action.office,
          term_start: action.effective,
          term_end: plannedEnd && plannedEnd >= action.effective ? plannedEnd : null,
          status: "published",
        },
        ends: true,
      },
    };
  }

  const p = action.patch;
  if (p.title !== undefined && !isOffice(p.title)) return fail(400, "Choose a board office.");
  if (p.end_reason != null && !(END_REASON_KEYS as string[]).includes(p.end_reason)) return fail(400, "Unknown end reason.");
  const nextStart = p.term_start !== undefined ? day(p.term_start) : start;
  const nextEnd = p.term_end !== undefined ? day(p.term_end) : day(term.term_end);
  if (nextStart && nextEnd && nextEnd < nextStart) return fail(400, "The term ends before it starts.");
  // Only these may change in place. The member never does: a different person is a different term.
  const patch = Object.fromEntries(
    CORRECTABLE.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])
  );
  if (!Object.keys(patch).length) return fail(400, "Nothing to correct.");
  return { ok: true, plan: { patch, open: null, ends: false } };
}
