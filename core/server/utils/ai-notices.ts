/**
 * The notices engine — HOA Connect's first proactive surface.
 *
 * Deterministic per-entity generators that read the community's own rows and
 * return the things a board or manager should look at. **No LLM calls, here or
 * anywhere downstream of here.** That is the point: a notice is a fact about
 * the data ("this request has been open 31 days"), arrived at by arithmetic, so
 * it cannot hallucinate, costs nothing, and is identical on every run. Phases
 * 5–7 layer language and judgement *on top of* this; they never replace it.
 *
 * Ported from Earnest `server/utils/ai-notices.ts` and re-aimed at HOA's
 * entities. What carried over unchanged is the shape — pure generators, one per
 * entity, each returning `AINotice[]`, rolled up by `collectDirectorAgenda()`
 * for the Board Room (Phase 6). What changed is every threshold and every
 * subject, because an HOA's calendar is not an agency's.
 *
 * Used by:
 *   · server/api/ai/notices/index.get.ts — org-scoped, on request
 *   · server/api/ai/notices/check.post.ts — the cron that turns urgent/high
 *     notices into notifications
 *   · collectDirectorAgenda() — Phase 6's Board Room packet
 *
 * ── Tenancy ────────────────────────────────────────────────────────────────
 * Every read here is filtered on `organization`, including the single-entity
 * generators. They run on the admin client, so an id from another community
 * would otherwise resolve happily; instead it resolves to nothing and the
 * generator returns `[]`. Passing the wrong org is a no-op, never a leak.
 *
 * ── Proposed actions ───────────────────────────────────────────────────────
 * A notice may carry ONE pre-validated proposed action. Those are deliberately
 * confined to reversible, internal executors — see `PROACTIVE_ACTIONS` and the
 * `propose()` guard below, which refuses anything outbound. Nothing this file
 * produces can cause an email, an announcement, or a board notification to be
 * sent, at any autonomy tier, even if a future caller auto-approves everything.
 */

import { readItems } from "@directus/sdk";
import { actionByKey } from "#core/shared/ai/actions";
import {
  attentionPriority,
  attentionScore,
  PRIORITY_ORDER,
  type AttentionPriority,
} from "#core/shared/ai/attention";

export type { AttentionPriority };
export { PRIORITY_ORDER };

export interface AINotice {
  id: string;
  priority: AttentionPriority;
  type: "warning" | "insight" | "suggestion";
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  /** Org-relative path — the caller prefixes the community slug. */
  actionRoute?: string;
  /** What this notice is about; drives notification routing and dedup. */
  entityType?: HoaEntityType;
  entityId?: string;
  /** The raw attention score behind `priority`, for sorting and for Phase 5. */
  score: number;
  proposedAction?: ProposedAction;
}

export interface ProposedAction {
  actionType: ProactiveActionKey;
  /** One-line summary for the ai_actions row title. */
  title: string;
  /** EXACT contract shape for the matching executor in server/utils/ai-actions.ts. */
  payload: Record<string, any>;
}

export type HoaEntityType =
  | "request"
  | "member"
  | "project"
  | "channel"
  | "vendor"
  | "meeting"
  | "payment_request"
  | "organization";

/**
 * The only executors a notice may propose. Every one is internal, reversible,
 * and already has an undo path in `ai-actions.ts`. `send_email`,
 * `post_announcement` and `notify_board` are absent on purpose and the guard
 * below enforces it — proactive code must never be able to transmit.
 */
export const PROACTIVE_ACTIONS = [
  "create_task",
  "add_comment",
  "set_due_date",
  "update_request_status",
] as const;

export type ProactiveActionKey = (typeof PROACTIVE_ACTIONS)[number];

/**
 * Build a proposed action, or nothing. Two independent gates, both of which
 * must pass: the key is in the allow-list above, AND the catalog says it is not
 * outbound. The second check is what makes this hold if someone later adds an
 * outbound key to the list by mistake, or flips an existing action's `outbound`
 * flag — the catalog stays the single source of truth for what leaves the
 * building.
 */
function propose(
  actionType: ProactiveActionKey,
  title: string,
  payload: Record<string, any>
): ProposedAction | undefined {
  if (!(PROACTIVE_ACTIONS as readonly string[]).includes(actionType)) return undefined;
  const def = actionByKey(actionType);
  if (!def || def.outbound) return undefined;
  return { actionType, title, payload };
}

// ── small helpers ─────────────────────────────────────────────────────────────

/**
 * Directus returns decimals as STRINGS — `"600.75"`, not `600.75` — and a
 * string concatenates where you expected addition, producing a silent $0.00 or
 * a NaN score. Coerce at the boundary, every time.
 */
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

const idOf = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : (v.id ?? null);

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** The untyped-SDK `never` convention — the schema-less client types every collection arg as `never`. */
const ri = readItems as any;

/** A bare `YYYY-MM-DD`, which is what a Directus `date` column returns. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Days from `now` to a stored value. Negative means it has already passed.
 *
 * Date-only columns — `hoa_projects.due_date`, `hoa_vendors.active_until` —
 * parse as UTC **midnight**, so measuring them in elapsed milliseconds against
 * a `now` at any other hour loses up to a day: a vendor whose cover ends on the
 * 24th of next month reads as "29 days" at lunchtime on the 24th of this one.
 * A person reading "expires in 30 days" means calendar days, so date-only
 * values are compared date-to-date and only real timestamps are measured by
 * elapsed time.
 */
function calendarDelta(at: unknown, now: Date): number | null {
  if (!at) return null;
  const raw = String(at);
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;

  if (DATE_ONLY.test(raw)) {
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((t - todayUtc) / 86_400_000);
  }
  return Math.floor((t - now.getTime()) / 86_400_000);
}

/**
 * Days since a stored value, floored at 0. Null/invalid → null.
 *
 * The floor is load-bearing, not defensive tidiness: Directus writes timestamps
 * from its own machine and has been measured running seconds ahead of the app
 * server, so a row created "just now" can legitimately carry a future stamp. A
 * negative age would flow straight into the attention curve.
 */
function ageInDays(at: unknown, now: Date): number | null {
  const delta = calendarDelta(at, now);
  if (delta === null) return null;
  return delta >= 0 ? 0 : -delta;
}

/** Days from `now` until a future date. Negative means it has passed. */
function daysUntil(at: unknown, now: Date): number | null {
  return calendarDelta(at, now);
}

/** Assemble a notice, scoring it once so `score` and `priority` cannot disagree. */
function notice(
  base: Omit<AINotice, "priority" | "score">,
  attention: Parameters<typeof attentionScore>[0]
): AINotice {
  return { ...base, score: attentionScore(attention), priority: attentionPriority(attention) };
}

// ── thresholds, all in one place so the tests and the docs agree ─────────────

export const NOTICE_THRESHOLDS = {
  /** An open request older than this is aged. */
  REQUEST_AGED_DAYS: 30,
  /** An open request nobody owns after this long needs an owner. */
  REQUEST_UNASSIGNED_DAYS: 3,
  /** An active project untouched for this long has gone quiet. */
  PROJECT_STALE_DAYS: 21,
  /** A conversation whose last message is this old is waiting on someone. */
  CHANNEL_QUIET_DAYS: 3,
  /** Vendor cover/contract inside this window is expiring. */
  VENDOR_EXPIRING_DAYS: 30,
  /** A past meeting without minutes after this long is overdue for them. */
  MEETING_MINUTES_DAYS: 7,
  /** Absolute credit floor below which the assistant is about to stop working. */
  CREDITS_LOW: 50,
  /** …or this fraction of the org's allowance, whichever bites first. */
  CREDITS_LOW_FRACTION: 0.1,
} as const;

// ── Requests ─────────────────────────────────────────────────────────────────

const OPEN_REQUEST_STATUSES = ["open", "in_progress", "waiting"];

export async function generateRequestNotices(
  directus: any,
  requestId: string,
  organizationId: string,
  now: Date
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const request = ((await directus
    .request(
      ri("hoa_requests", {
        filter: { id: { _eq: requestId }, organization: { _eq: organizationId } },
        fields: [
          "id", "title", "status", "type", "priority", "due_date",
          "assigned_to", "date_created", "date_updated",
        ],
        limit: 1,
      })
    )
    .catch(() => [])) as any[])[0];

  if (!request) return notices;
  if (!OPEN_REQUEST_STATUSES.includes(String(request.status))) return notices;

  const label = request.title || "Untitled request";
  const daysOpen = ageInDays(request.date_created, now);

  // Aged — open far longer than a request should live.
  if (daysOpen !== null && daysOpen >= NOTICE_THRESHOLDS.REQUEST_AGED_DAYS) {
    notices.push(
      notice(
        {
          id: `request-aged-${requestId}`,
          type: "warning",
          icon: "lucide:clock-alert",
          title: `Open ${daysOpen} days: ${label}`,
          description: `This request has been open since ${String(request.date_created).slice(0, 10)} without being resolved. Either it is genuinely still in progress, in which case a task would say so, or it has been forgotten.`,
          actionLabel: "Open request",
          actionRoute: `/requests/${requestId}`,
          entityType: "request",
          entityId: requestId,
          proposedAction: propose("create_task", `Follow up on "${label}"`, {
            title: `Follow up on "${label}"`,
            description: `Request has been open ${daysOpen} days with no resolution. Confirm where it stands or close it.`,
            priority: "high",
            request_id: requestId,
          }),
        },
        { type: "action", daysOverdue: daysOpen }
      )
    );
  }

  // Past its own due date.
  const overdueBy = request.due_date ? -(daysUntil(request.due_date, now) ?? 0) : 0;
  if (request.due_date && overdueBy > 0) {
    notices.push(
      notice(
        {
          id: `request-overdue-${requestId}`,
          type: "warning",
          icon: "lucide:calendar-x",
          title: `${overdueBy} ${plural(overdueBy, "day")} past due: ${label}`,
          description: `This request was due ${String(request.due_date).slice(0, 10)} and is still ${request.status}. Move the date or move the work.`,
          actionLabel: "Open request",
          actionRoute: `/requests/${requestId}`,
          entityType: "request",
          entityId: requestId,
        },
        { type: "action", daysOverdue: overdueBy }
      )
    );
  }

  // Nobody owns it.
  if (
    !idOf(request.assigned_to) &&
    daysOpen !== null &&
    daysOpen >= NOTICE_THRESHOLDS.REQUEST_UNASSIGNED_DAYS
  ) {
    notices.push(
      notice(
        {
          id: `request-unassigned-${requestId}`,
          type: "suggestion",
          icon: "lucide:user-x",
          title: `Unassigned for ${daysOpen} days: ${label}`,
          description: "Nobody is named on this request, so nobody is answerable for it. Assigning it is usually the difference between a week and a month.",
          actionLabel: "Open request",
          actionRoute: `/requests/${requestId}`,
          entityType: "request",
          entityId: requestId,
        },
        { type: "action", daysOverdue: daysOpen }
      )
    );
  }

  return notices;
}

// ── Members (dues) ───────────────────────────────────────────────────────────

export async function generateMemberNotices(
  directus: any,
  memberId: string,
  organizationId: string,
  now: Date
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const member = ((await directus
    .request(
      ri("hoa_members", {
        filter: { id: { _eq: memberId }, organization: { _eq: organizationId } },
        fields: [
          "id", "first_name", "last_name", "status",
          "outstanding_balance", "payment_status", "last_payment_date",
        ],
        limit: 1,
      })
    )
    .catch(() => [])) as any[])[0];

  if (!member || member.status !== "active") return notices;

  const balance = num(member.outstanding_balance);
  if (balance <= 0) return notices;

  const label = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "A member";
  // Nothing records when the balance FIRST went unpaid, so the last payment is
  // the only honest anchor for how long this has been true. A member who has
  // never paid has no anchor at all — score that as the plain balance rather
  // than inventing an age, which is the mistake that puts a nine-year-old
  // account permanently at the top.
  const sinceLastPayment = ageInDays(member.last_payment_date, now);
  const delinquent = member.payment_status === "delinquent";

  notices.push(
    notice(
      {
        id: `member-balance-${memberId}`,
        type: "warning",
        icon: "lucide:wallet",
        title: `${money(balance)} outstanding — ${label}`,
        description: sinceLastPayment
          ? `Last payment was ${sinceLastPayment} ${plural(sinceLastPayment, "day")} ago and ${money(balance)} remains on the account.`
          : `${money(balance)} is outstanding and no payment has been recorded against this account.`,
        actionLabel: "View member",
        actionRoute: `/admin/members`,
        entityType: "member",
        entityId: memberId,
      },
      {
        type: "action",
        daysOverdue: sinceLastPayment ?? 0,
        amount: balance,
        // Delinquency is a status someone deliberately set; honour it as a
        // second day of overdueness rather than letting the curve alone decide.
        isToday: delinquent,
      }
    )
  );

  return notices;
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function generateProjectNotices(
  directus: any,
  projectId: string,
  organizationId: string,
  now: Date
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const project = ((await directus
    .request(
      ri("hoa_projects", {
        filter: { id: { _eq: projectId }, organization: { _eq: organizationId } },
        fields: [
          "id", "title", "status", "due_date", "date_updated", "date_created",
          "budget_amount", "actual_spend",
        ],
        limit: 1,
      })
    )
    .catch(() => [])) as any[])[0];

  if (!project) return notices;
  if (!["planning", "active", "on_hold"].includes(String(project.status))) return notices;

  const label = project.title || "Untitled project";
  const quietFor = ageInDays(project.date_updated || project.date_created, now);

  if (quietFor !== null && quietFor >= NOTICE_THRESHOLDS.PROJECT_STALE_DAYS) {
    notices.push(
      notice(
        {
          id: `project-stale-${projectId}`,
          type: "warning",
          icon: "lucide:hard-hat",
          title: `No movement in ${quietFor} days: ${label}`,
          description: `This project is still ${project.status} but nothing on it has changed in ${quietFor} days. A project that has genuinely stalled is worth putting on hold explicitly, so the board stops counting on it.`,
          actionLabel: "Open project",
          actionRoute: `/projects/${projectId}`,
          entityType: "project",
          entityId: projectId,
          proposedAction: propose("create_task", `Check in on "${label}"`, {
            title: `Check in on "${label}"`,
            description: `No activity for ${quietFor} days. Confirm the current status and next step, or move the project to on-hold.`,
            priority: "normal",
            project_id: projectId,
          }),
        },
        { type: "action", daysOverdue: quietFor }
      )
    );
  }

  const overdueBy = project.due_date ? -(daysUntil(project.due_date, now) ?? 0) : 0;
  if (project.due_date && overdueBy > 0) {
    notices.push(
      notice(
        {
          id: `project-overdue-${projectId}`,
          type: "warning",
          icon: "lucide:calendar-x",
          title: `${overdueBy} ${plural(overdueBy, "day")} past due: ${label}`,
          description: `The completion date was ${String(project.due_date).slice(0, 10)} and the project is still ${project.status}.`,
          actionLabel: "Open project",
          actionRoute: `/projects/${projectId}`,
          entityType: "project",
          entityId: projectId,
        },
        { type: "action", daysOverdue: overdueBy }
      )
    );
  }

  const budget = num(project.budget_amount);
  const spend = num(project.actual_spend);
  if (budget > 0 && spend > budget) {
    const over = spend - budget;
    notices.push(
      notice(
        {
          id: `project-overbudget-${projectId}`,
          type: "warning",
          icon: "lucide:trending-up",
          title: `${money(over)} over budget: ${label}`,
          description: `Spend of ${money(spend)} against a ${money(budget)} budget. Overruns are easier to explain to members before the next assessment than after it.`,
          actionLabel: "Open project",
          actionRoute: `/projects/${projectId}`,
          entityType: "project",
          entityId: projectId,
        },
        { type: "action", amount: over }
      )
    );
  }

  return notices;
}

// ── Channels ─────────────────────────────────────────────────────────────────

export async function generateChannelNotices(
  directus: any,
  channelId: string,
  organizationId: string,
  now: Date
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const channel = ((await directus
    .request(
      ri("hoa_channels", {
        filter: { id: { _eq: channelId }, organization: { _eq: organizationId } },
        fields: ["id", "name", "slug", "status", "is_private"],
        limit: 1,
      })
    )
    .catch(() => [])) as any[])[0];

  if (!channel || channel.status !== "published") return notices;

  const newest = ((await directus
    .request(
      ri("hoa_channel_messages", {
        filter: { channel: { _eq: channelId }, status: { _eq: "published" } },
        fields: ["id", "date_created"],
        sort: ["-date_created"],
        limit: 1,
      })
    )
    .catch(() => [])) as any[])[0];

  // A channel nobody has ever written in is a channel nobody needs told about.
  if (!newest) return notices;

  const waiting = ageInDays(newest.date_created, now);
  if (waiting === null || waiting < NOTICE_THRESHOLDS.CHANNEL_QUIET_DAYS) return notices;

  notices.push(
    notice(
      {
        id: `channel-waiting-${channelId}`,
        type: "warning",
        icon: "lucide:message-square-dot",
        title: `${waiting} days without a reply: #${channel.name}`,
        description: `The last message in this conversation was ${waiting} ${plural(waiting, "day")} ago and nothing has followed it. Silence in a channel reads as being ignored, whether or not it is.`,
        actionLabel: "Open channel",
        actionRoute: `/admin/channels/${channel.slug ?? channelId}`,
        entityType: "channel",
        entityId: channelId,
      },
      { type: "action", daysOverdue: waiting }
    )
  );

  return notices;
}

// ── Vendors ──────────────────────────────────────────────────────────────────

export async function generateVendorNotices(
  directus: any,
  vendorId: string,
  organizationId: string,
  now: Date
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const vendor = ((await directus
    .request(
      ri("hoa_vendors", {
        filter: { id: { _eq: vendorId }, organization: { _eq: organizationId } },
        fields: ["id", "name", "company", "status", "active_until", "category"],
        limit: 1,
      })
    )
    .catch(() => [])) as any[])[0];

  if (!vendor || vendor.status !== "active") return notices;
  if (!vendor.active_until) return notices;

  const label = vendor.company || vendor.name || "A vendor";
  const left = daysUntil(vendor.active_until, now);
  if (left === null) return notices;

  if (left < 0) {
    const lapsedBy = -left;
    notices.push(
      notice(
        {
          id: `vendor-lapsed-${vendorId}`,
          type: "warning",
          icon: "lucide:shield-x",
          title: `Cover lapsed ${lapsedBy} ${plural(lapsedBy, "day")} ago: ${label}`,
          description: `${label} is still marked active but their contract/insurance ran out on ${String(vendor.active_until).slice(0, 10)}. Work done by an uninsured vendor is the association's exposure, not theirs.`,
          actionLabel: "View vendors",
          actionRoute: "/admin/vendors",
          entityType: "vendor",
          entityId: vendorId,
          proposedAction: propose("create_task", `Renew or retire ${label}`, {
            title: `Renew or retire ${label}`,
            description: `Contract/insurance expired ${String(vendor.active_until).slice(0, 10)}. Obtain a current certificate or set the vendor inactive.`,
            priority: "urgent",
          }),
        },
        { type: "action", daysOverdue: lapsedBy }
      )
    );
  } else if (left <= NOTICE_THRESHOLDS.VENDOR_EXPIRING_DAYS) {
    notices.push(
      notice(
        {
          id: `vendor-expiring-${vendorId}`,
          type: "insight",
          icon: "lucide:shield-alert",
          title: `Cover expires in ${left} ${plural(left, "day")}: ${label}`,
          description: `${label}'s contract/insurance runs out on ${String(vendor.active_until).slice(0, 10)}. Renewals are quick a month out and slow the week of.`,
          actionLabel: "View vendors",
          actionRoute: "/admin/vendors",
          entityType: "vendor",
          entityId: vendorId,
        },
        { type: "reminder", isToday: left === 0, isTomorrow: left === 1 }
      )
    );
  }

  return notices;
}

// ── Meetings ─────────────────────────────────────────────────────────────────

export async function generateMeetingNotices(
  directus: any,
  meetingId: string,
  organizationId: string,
  now: Date
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const meeting = ((await directus
    .request(
      ri("hoa_meetings", {
        filter: { id: { _eq: meetingId }, organization: { _eq: organizationId } },
        fields: ["id", "title", "status", "meeting_date", "minutes", "type"],
        limit: 1,
      })
    )
    .catch(() => [])) as any[])[0];

  if (!meeting) return notices;
  if (meeting.status === "canceled") return notices;

  const since = ageInDays(meeting.meeting_date, now);
  if (since === null || since < NOTICE_THRESHOLDS.MEETING_MINUTES_DAYS) return notices;

  // A future meeting has an age of 0 through `daysBetween`'s floor, so it can
  // never reach the threshold — no need to test the direction separately.
  const hasMinutes = typeof meeting.minutes === "string" && meeting.minutes.trim().length > 0;
  if (hasMinutes) return notices;

  const label = meeting.title || "A meeting";
  notices.push(
    notice(
      {
        id: `meeting-minutes-${meetingId}`,
        type: "warning",
        icon: "lucide:file-text",
        title: `No minutes ${since} days on: ${label}`,
        description: `This meeting was held on ${String(meeting.meeting_date).slice(0, 10)} and still has no minutes recorded. In most states minutes are the association's evidence that a decision was properly made.`,
        actionLabel: "Open meetings",
        actionRoute: "/admin/meetings",
        entityType: "meeting",
        entityId: meetingId,
        proposedAction: propose("create_task", `Write up minutes for "${label}"`, {
          title: `Write up minutes for "${label}"`,
          description: `Held ${String(meeting.meeting_date).slice(0, 10)}; no minutes recorded ${since} days later.`,
          priority: "high",
        }),
      },
      { type: "action", daysOverdue: since }
    )
  );

  return notices;
}

// ── Payment requests (the association's invoices) ────────────────────────────

const UNPAID_INVOICE_STATUSES = ["active", "overdue", "partially_paid"];

export async function generatePaymentRequestNotices(
  directus: any,
  paymentRequestId: string,
  organizationId: string,
  now: Date
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const pr = ((await directus
    .request(
      ri("payment_requests", {
        filter: { id: { _eq: paymentRequestId }, organization: { _eq: organizationId } },
        fields: [
          "id", "title", "status", "amount", "amount_remaining", "amount_paid",
          "due_date", "member", "reminder_sent",
        ],
        limit: 1,
      })
    )
    .catch(() => [])) as any[])[0];

  if (!pr) return notices;
  if (!UNPAID_INVOICE_STATUSES.includes(String(pr.status))) return notices;

  // `amount_remaining` is the truth once a partial payment lands; fall back to
  // the full amount only when nothing has been paid against it.
  const paid = num(pr.amount_paid);
  const remaining = pr.amount_remaining != null ? num(pr.amount_remaining) : num(pr.amount) - paid;
  if (remaining <= 0) return notices;

  const overdueBy = pr.due_date ? -(daysUntil(pr.due_date, now) ?? 0) : 0;
  if (overdueBy <= 0) return notices;

  const label = pr.title || "An invoice";
  notices.push(
    notice(
      {
        id: `invoice-overdue-${paymentRequestId}`,
        type: "warning",
        icon: "lucide:receipt-text",
        title: `${money(remaining)} unpaid, ${overdueBy} ${plural(overdueBy, "day")} late: ${label}`,
        description: `Due ${String(pr.due_date).slice(0, 10)}; ${money(remaining)} of ${money(num(pr.amount))} is still outstanding.`,
        actionLabel: "View payments",
        actionRoute: "/admin/payments",
        entityType: "payment_request",
        entityId: paymentRequestId,
      },
      { type: "action", daysOverdue: overdueBy, amount: remaining }
    )
  );

  return notices;
}

// ── The organisation itself ──────────────────────────────────────────────────

export async function generateOrganizationNotices(
  directus: any,
  organizationId: string,
  now: Date
): Promise<AINotice[]> {
  const notices: AINotice[] = [];

  const wallet = ((await directus
    .request(
      ri("ai_wallets", {
        filter: { organization: { _eq: organizationId } },
        fields: ["id", "balance_credits", "allowance_credits", "period_resets_at", "auto_refill_enabled"],
        limit: 1,
      })
    )
    .catch(() => [])) as any[])[0];

  if (wallet) {
    const balance = num(wallet.balance_credits);
    const allowance = num(wallet.allowance_credits);
    const floor = Math.max(
      NOTICE_THRESHOLDS.CREDITS_LOW,
      Math.round(allowance * NOTICE_THRESHOLDS.CREDITS_LOW_FRACTION)
    );
    // Auto-refill means this resolves itself; saying so anyway is noise.
    if (balance <= floor && wallet.auto_refill_enabled !== true) {
      const resetsIn = daysUntil(wallet.period_resets_at, now);
      notices.push(
        notice(
          {
            id: `org-credits-${organizationId}`,
            type: balance <= 0 ? "warning" : "insight",
            icon: "lucide:battery-low",
            title:
              balance <= 0
                ? "AI credits exhausted"
                : `${balance} AI ${plural(balance, "credit")} left`,
            description:
              resetsIn !== null && resetsIn >= 0
                ? `The assistant's balance is ${balance}, against an allowance of ${allowance}. It resets in ${resetsIn} ${plural(resetsIn, "day")}; until then drafting will start to fail.`
                : `The assistant's balance is ${balance}, against an allowance of ${allowance}. Drafting will start to fail.`,
            actionLabel: "AI spend",
            actionRoute: "/admin/ai-spend",
            entityType: "organization",
            entityId: organizationId,
          },
          { type: balance <= 0 ? "action" : "reminder", isToday: balance <= 0 }
        )
      );
    }
  }

  return notices;
}

// ── The org-wide sweep ───────────────────────────────────────────────────────

/** How many of each kind of thing one sweep will look at. */
const SWEEP_LIMIT = 200;

/**
 * Every notice for one community. Never throws — each sub-fetch degrades to
 * nothing on failure, so a single unreadable collection costs that collection's
 * notices and not the whole sweep. This is what the endpoint, the cron and the
 * agenda all sit on.
 */
export async function collectOrgNotices(
  directus: any,
  organizationId: string,
  now: Date
): Promise<AINotice[]> {
  const list = async (collection: string, filter: any, limit = SWEEP_LIMIT): Promise<any[]> =>
    ((await directus
      .request(ri(collection, { filter, fields: ["id"], limit }))
      .catch(() => [])) as any[]) || [];

  const org = { organization: { _eq: organizationId } };

  const [requests, members, projects, channels, vendors, meetings, invoices] = await Promise.all([
    list("hoa_requests", { _and: [org, { status: { _in: OPEN_REQUEST_STATUSES } }] }),
    list("hoa_members", {
      _and: [
        org,
        { status: { _eq: "active" } },
        { outstanding_balance: { _gt: 0 } },
      ],
    }),
    list("hoa_projects", { _and: [org, { status: { _in: ["planning", "active", "on_hold"] } }] }),
    list("hoa_channels", { _and: [org, { status: { _eq: "published" } }] }),
    list("hoa_vendors", {
      _and: [org, { status: { _eq: "active" } }, { active_until: { _nnull: true } }],
    }),
    list("hoa_meetings", { _and: [org, { status: { _neq: "canceled" } }] }),
    list("payment_requests", { _and: [org, { status: { _in: UNPAID_INVOICE_STATUSES } }] }),
  ]);

  const run = async (
    rows: any[],
    gen: (d: any, id: string, org: string, now: Date) => Promise<AINotice[]>
  ): Promise<AINotice[][]> =>
    Promise.all(
      rows.map((r) => gen(directus, String(r.id), organizationId, now).catch(() => []))
    );

  const results = await Promise.all([
    run(requests, generateRequestNotices),
    run(members, generateMemberNotices),
    run(projects, generateProjectNotices),
    run(channels, generateChannelNotices),
    run(vendors, generateVendorNotices),
    run(meetings, generateMeetingNotices),
    run(invoices, generatePaymentRequestNotices),
    generateOrganizationNotices(directus, organizationId, now)
      .catch(() => [])
      .then((n) => [n]),
  ]);

  const all = results.flat(2) as AINotice[];
  return sortNotices(all);
}

/** Most urgent first; within a bucket, the higher score. Stable on id. */
export function sortNotices(notices: AINotice[]): AINotice[] {
  return [...notices].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 9;
    const pb = PRIORITY_ORDER[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
}

// ── Board Room agenda (Phase 6 consumes this) ────────────────────────────────

export type DirectorSubjectKey =
  | "requests"
  | "money"
  | "projects"
  | "community"
  | "vendors"
  | "meetings"
  | "operations";

/** Notice.entityType → agenda subject. */
const SUBJECT_OF_ENTITY: Record<HoaEntityType, DirectorSubjectKey> = {
  request: "requests",
  member: "money",
  payment_request: "money",
  project: "projects",
  channel: "community",
  vendor: "vendors",
  meeting: "meetings",
  organization: "operations",
};

const SUBJECT_LABEL: Record<DirectorSubjectKey, string> = {
  requests: "Requests",
  money: "Money",
  projects: "Projects",
  community: "Community",
  vendors: "Vendors",
  meetings: "Meetings",
  operations: "Operations",
};

/** Focused mode: entity type → its single-entity generator. */
const FOCUSED_GENERATOR: Record<
  string,
  (d: any, id: string, org: string, now: Date) => Promise<AINotice[]>
> = {
  request: generateRequestNotices,
  member: generateMemberNotices,
  project: generateProjectNotices,
  channel: generateChannelNotices,
  vendor: generateVendorNotices,
  meeting: generateMeetingNotices,
  payment_request: generatePaymentRequestNotices,
};

export interface DirectorAgendaGroup {
  subject: DirectorSubjectKey;
  label: string;
  /** Highest priority present — drives group order and accent. */
  topPriority: AttentionPriority;
  notices: AINotice[];
  /** How many of this group's notices carry a ready-to-propose action. */
  proposedCount: number;
}

export interface DirectorAgenda {
  mode: "org" | "entity";
  entityType?: string;
  entityId?: string;
  groups: DirectorAgendaGroup[];
  totalNotices: number;
  totalProposed: number;
}

/** Cap per group so an org-wide packet stays readable. */
const AGENDA_GROUP_LIMIT = 12;

function buildAgendaGroups(notices: AINotice[]): DirectorAgendaGroup[] {
  const bySubject = new Map<DirectorSubjectKey, AINotice[]>();
  for (const n of notices) {
    const subject = n.entityType ? SUBJECT_OF_ENTITY[n.entityType] : undefined;
    if (!subject) continue;
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject)!.push(n);
  }

  const groups: DirectorAgendaGroup[] = [];
  for (const [subject, list] of bySubject) {
    const sorted = sortNotices(list);
    const capped = sorted.slice(0, AGENDA_GROUP_LIMIT);
    groups.push({
      subject,
      label: SUBJECT_LABEL[subject],
      topPriority: capped[0]?.priority ?? "low",
      notices: capped,
      // Counted across the WHOLE group, not the capped slice — the number is
      // "how much is proposable here", and capping it would under-report.
      proposedCount: sorted.filter((n) => n.proposedAction).length,
    });
  }

  groups.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.topPriority] ?? 9;
    const pb = PRIORITY_ORDER[b.topPriority] ?? 9;
    if (pa !== pb) return pa - pb;
    if (b.notices.length !== a.notices.length) return b.notices.length - a.notices.length;
    return a.subject.localeCompare(b.subject);
  });
  return groups;
}

/**
 * The Board Room packet. Org-wide by default; pass an entity to hold a meeting
 * about one thing. Never throws — a failed sub-fetch degrades to fewer notices,
 * matching the cron.
 *
 * Phase 6 depends on this being here and on its shape; it is built in Phase 4
 * so the Board Room has real, grounded material to reason over on day one
 * rather than a stub.
 */
export async function collectDirectorAgenda(
  directus: any,
  organizationId: string,
  now: Date,
  focus?: { entityType?: string | null; entityId?: string | null }
): Promise<DirectorAgenda> {
  if (focus?.entityType && focus.entityId) {
    const gen = FOCUSED_GENERATOR[focus.entityType];
    const notices = gen
      ? await gen(directus, String(focus.entityId), organizationId, now).catch(() => [])
      : [];
    return {
      mode: "entity",
      entityType: focus.entityType,
      entityId: String(focus.entityId),
      groups: buildAgendaGroups(notices),
      totalNotices: notices.length,
      totalProposed: notices.filter((n) => n.proposedAction).length,
    };
  }

  const all = await collectOrgNotices(directus, organizationId, now);
  const groups = buildAgendaGroups(all);

  // Money is always on the agenda, even in a quarter where nobody owes
  // anything — "no arrears" is a finding a board wants stated, not an absence
  // it has to notice for itself.
  if (!groups.some((g) => g.subject === "money")) {
    groups.push({
      subject: "money",
      label: SUBJECT_LABEL.money,
      topPriority: "low",
      notices: [],
      proposedCount: 0,
    });
  }

  return {
    mode: "org",
    groups,
    totalNotices: all.length,
    totalProposed: all.filter((n) => n.proposedAction).length,
  };
}
