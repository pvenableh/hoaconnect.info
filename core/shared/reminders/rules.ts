/**
 * The reminder rules (Earnest parity round 3, Phase 5a) — pure. Given a
 * snapshot of one community (its charges, meetings, requests, polls, vendors,
 * with every audience already resolved to user ids) and an `asOf`, say which
 * reminders are due right now: one `Reminder` per person, each with the
 * UNIQUE key the tick claims before it sends.
 *
 * ── Time is the community's ────────────────────────────────────────────────
 * Every "today", "the 7th day before" and "9 am" is on the wall clock of the
 * org's zone (`hoa_organizations.timezone`), with @internationalized/date as
 * core/shared/email/recurrence.ts does: an evening tick in Los Angeles is
 * already tomorrow in UTC, and dues due "tomorrow" mean the community's
 * tomorrow. A date-only field (`due_date`, `cure_by`, `active_until`) is a
 * calendar day; a timestamp (`meeting_date`, `closes_at`) is an instant.
 *
 * ── When a reminder may go out ─────────────────────────────────────────────
 * Each stage is a WINDOW, not an instant, so an hourly tick that is late, or
 * that runs out of budget, still sends it on the next one:
 *   - day stages (dues, violations, coverage, the meeting's week-ahead) are due
 *     on their local day(s), from the send hour;
 *   - event stages (a status change, a poll opening or closing) are due for
 *     48 h after the event;
 *   - nothing goes out before the send hour or from 21:00 (QUIET_FROM_HOUR)
 *     local — except the meeting-in-an-hour push, which is the point.
 * The windows of one rule don't overlap, and a window never reaches back
 * (a charge created three days before it's due gets "due on Friday", not
 * "due in a week").
 *
 * ── The key ────────────────────────────────────────────────────────────────
 * `<rule>:<entity id>:<stage>@<anchor>:<user id>` — Earnest's
 * `invoice_reminders.reminder_key`. The anchor is the date or instant the
 * stage hangs off (the due date, the meeting's start, the status change): a
 * rescheduled meeting or a moved due date is a new reminder, a second tick on
 * the same one is not. The cadence lives here, in the windows; the key only
 * makes "at most once" true.
 */
import { fromAbsolute, parseDate, toCalendarDate, type CalendarDate } from "@internationalized/date";
import type { NotificationCategory } from "../notifications/preferences";
import {
  QUIET_FROM_HOUR,
  type ReminderRule,
  type ReminderStage,
  type ResolvedReminderSettings,
} from "./settings";

export type ReminderChannel = "bell" | "push" | "email";
export type ReminderUrgency = "low" | "normal" | "high";
/** The email body: one of the four content partials, or the generic notification (`notice`). */
export type ReminderTemplate = "reminder-dues" | "reminder-meeting" | "reminder-violation" | "reminder-poll" | "notice";
export type ReminderAudience =
  | "billed"
  | "owner"
  | "tenant"
  | "member"
  | "submitter"
  | "assignee"
  | "violator"
  | "admin";

/** One charge on a dues reminder. */
export interface ReminderLine {
  label: string;
  amount: string;
  due: string;
}

export interface Reminder {
  /** UNIQUE in hoa_reminder_log — the claim. */
  key: string;
  rule: ReminderRule;
  stage: ReminderStage;
  /** Rule and stage are on in the org's settings. The dry run lists the others too. */
  enabled: boolean;
  entity: { collection: string; id: string };
  /** The recipient's Directus user id. */
  member: string;
  audience: ReminderAudience;
  template: ReminderTemplate;
  vars: Record<string, string>;
  lines?: ReminderLine[];
  urgency: ReminderUrgency;
  channels: ReminderChannel[];
  /** Dues and violations: email ignores the per-category opt-out (the master switch still holds). */
  essential: boolean;
  category: NotificationCategory;
  /** Reminders with the same group go out as ONE notification (a member's dues on one day). */
  group: string;
  /** Push time-to-live: a meeting-in-an-hour push is worthless after the meeting starts. */
  ttlSeconds?: number;
}

// ── The snapshot ────────────────────────────────────────────────────────────

export interface ChargeInput {
  id: string;
  label: string;
  status: string | null;
  amountRemaining: number;
  /** `payment_requests.due_date` — a calendar day. */
  dueDate: string | null;
  /** The billed member's user id. */
  billedUserId: string | null;
  /** The unit's current residents (residencyFor), when the charge has a unit. */
  residents: Array<{ userId: string; residency: "owner" | "tenant" | null }>;
  /** Stages the billing worker already sent (`metadata.reminders`): due_soon | due | past_grace. */
  sentStages: string[];
}

export interface MeetingInput {
  id: string;
  title: string;
  /** `hoa_meetings.meeting_date` — an instant. */
  startsAt: string | null;
  status: string | null;
  published: boolean;
  location?: string | null;
  audienceUserIds: string[];
}

export interface RequestInput {
  id: string;
  type: string | null;
  title: string;
  status: string | null;
  /** `metadata.workflow_state`, for the label ("Notice sent"). */
  workflowState?: string | null;
  /** `metadata.status_changed_at`, written by the request workflow on a transition. */
  statusChangedAt?: string | null;
  submittedBy?: string | null;
  assignedTo?: string | null;
  /** The member a violation is about. */
  memberUserId?: string | null;
  /** `metadata.cure_by` — a calendar day. */
  cureBy?: string | null;
  /** The latest of the row's update and its last comment. */
  lastActivityAt?: string | null;
}

export interface PollInput {
  id: string;
  question: string;
  status: string | null;
  createdAt: string | null;
  /**
   * `closes_at`. It is also the "closed" stage's anchor, so the close route
   * (`POST /api/org/polls/close`) sets it to the moment a poll is closed by hand
   * before it, or with none, and announces the close under the same key.
   */
  closesAt?: string | null;
  audienceUserIds: string[];
  voterUserIds: string[];
  /** "Yes — 12 of 20 votes", when there are votes. */
  resultSentence?: string | null;
}

export interface VendorInput {
  id: string;
  name: string;
  /** `hoa_vendors.active_until` — a calendar day. */
  activeUntil: string | null;
}

export interface ReminderSnapshot {
  org: { id: string; slug: string; name: string; timeZone: string; graceDays: number };
  settings: ResolvedReminderSettings;
  charges: ChargeInput[];
  meetings: MeetingInput[];
  requests: RequestInput[];
  polls: PollInput[];
  vendors: VendorInput[];
  adminUserIds: string[];
}

// ── The clock ───────────────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** How long an event stage (status change, poll opened / closed) stays due. */
export const EVENT_WINDOW_MS = 48 * HOUR_MS;
/** Overdue dues are reminded once, within this many days of the grace ending — after that it is collections, not a reminder. */
export const OVERDUE_SPAN_DAYS = 30;
/** Coverage that has ended is reported for a week. */
export const EXPIRED_SPAN_DAYS = 7;

export interface ReminderClock {
  asOf: number;
  timeZone: string;
  today: CalendarDate;
  hour: number;
  /** From the send hour until QUIET_FROM_HOUR, local. */
  awake: boolean;
}

export function reminderClock(asOf: Date, timeZone: string, sendHour: number): ReminderClock {
  const z = fromAbsolute(asOf.getTime(), timeZone);
  return {
    asOf: asOf.getTime(),
    timeZone,
    today: toCalendarDate(z),
    hour: z.hour,
    awake: z.hour >= sendHour && z.hour < QUIET_FROM_HOUR,
  };
}

const dayNumber = (d: { year: number; month: number; day: number }) => Date.UTC(d.year, d.month - 1, d.day) / DAY_MS;

/** Whole days from `a` to `b` (b − a). */
export const daysBetween = (a: CalendarDate, b: CalendarDate) => dayNumber(b) - dayNumber(a);

/**
 * A field's calendar day in `timeZone`. A date (`2026-11-10`) or a zone-less
 * datetime (Directus `dateTime`) is that wall date; an instant (`…Z`, `…+02:00`)
 * is the local day it falls on.
 */
export function localDay(value: string | null | undefined, timeZone: string): CalendarDate | null {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  const wall = /^(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+)?$/.exec(v);
  try {
    if (wall) return parseDate(wall[1]!);
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : toCalendarDate(fromAbsolute(ms, timeZone));
  } catch {
    return null;
  }
}

/** A timestamp as ms; a zone-less datetime is read as UTC. NaN when there isn't one. */
export const instant = (value: string | null | undefined): number => {
  if (!value) return NaN;
  // A zone-less datetime is read as UTC, which is what Directus `timestamp` returns without the Z.
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
};

const pad = (n: number) => String(n).padStart(2, "0");
const dayAnchor = (d: CalendarDate) => `${d.year}${pad(d.month)}${pad(d.day)}`;
const instantAnchor = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
};

export function reminderKey(rule: ReminderRule, entityId: string, stage: ReminderStage, anchor: string, userId: string): string {
  return `${rule}:${entityId}:${stage}@${anchor}:${userId}`;
}

// ── Formatting (on the community's clock) ───────────────────────────────────

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatMoney = (n: number) => usd.format(Number.isFinite(n) ? n : 0);

/** "Tue, Nov 10" */
export function formatDay(d: CalendarDate): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(d.year, d.month - 1, d.day))
  );
}

/** "7:00 PM" */
export function formatTime(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(ms));
}

/** "today at 7:00 PM" · "tomorrow at 7:00 PM" · "Thu, Nov 12 at 7:00 PM" */
export function formatWhen(ms: number, clock: ReminderClock): string {
  const day = toCalendarDate(fromAbsolute(ms, clock.timeZone));
  const diff = daysBetween(clock.today, day);
  const time = formatTime(ms, clock.timeZone);
  if (diff === 0) return `today at ${time}`;
  if (diff === 1) return `tomorrow at ${time}`;
  return `${formatDay(day)} at ${time}`;
}

const humanize = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// ── The rules ───────────────────────────────────────────────────────────────

const OPEN_CHARGE = new Set(["active", "partially_paid", "overdue"]);
/** The billing worker's names for the same stages (scripts/billing-worker.ts `stageFor`). */
export const WORKER_STAGE: Record<"before" | "due" | "overdue", string> = {
  before: "due_soon",
  due: "due",
  overdue: "past_grace",
};
const OPEN_REQUEST = new Set(["open", "in_progress", "waiting"]);
const CLOSED_REQUEST = new Set(["resolved", "closed"]);
/** The request types a resident files and follows. Violations have their own rule; tasks are the board's. */
const RESIDENT_REQUEST_TYPES = new Set(["maintenance", "arc", "complaint", "question"]);
const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  waiting: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};
/** Does this status change on this kind of request tell the person who submitted it? (The status event and the comment bell both ask.) */
export const isResidentStatusChange = (type: string | null | undefined, status: string | null | undefined): boolean =>
  RESIDENT_REQUEST_TYPES.has(type ?? "") && !!STATUS_LABELS[status ?? ""];
const ALL: ReminderChannel[] = ["bell", "push", "email"];

type Emit = (r: Omit<Reminder, "enabled" | "key"> & { anchor: string }) => void;

/** A stage that is due but reaches nobody with an app account (the dry run reports it). */
export interface UnreachableReminder {
  rule: ReminderRule;
  stage: ReminderStage;
  entity: { collection: string; id: string };
}
type Unreachable = (u: UnreachableReminder) => void;

function dues(snap: ReminderSnapshot, clock: ReminderClock, emit: Emit, unreachable: Unreachable) {
  const cfg = snap.settings.rules.dues;
  const grace = Math.max(0, Math.floor(snap.org.graceDays || 0));
  for (const c of snap.charges) {
    if (!OPEN_CHARGE.has(c.status ?? "") || !(c.amountRemaining > 0)) continue;
    const due = localDay(c.dueDate, clock.timeZone);
    if (!due) continue;
    const after = daysBetween(due, clock.today);
    let stage: "before" | "due" | "overdue" | null = null;
    if (after >= -cfg.days && after <= -1 && c.status !== "overdue") stage = "before";
    else if (after === 0 && c.status !== "overdue") stage = "due";
    else if (after >= grace + 1 && after <= grace + OVERDUE_SPAN_DAYS) stage = "overdue";
    if (!stage || !clock.awake) continue;
    // The billing worker sent this one already (before this rule was on).
    if (c.sentStages.includes(WORKER_STAGE[stage])) continue;

    const people = new Map<string, ReminderAudience>();
    if (c.billedUserId) people.set(c.billedUserId, "billed");
    for (const r of c.residents) {
      if (!r.userId || people.has(r.userId)) continue;
      if (r.residency === "tenant" && !cfg.tenants) continue;
      people.set(r.userId, r.residency === "tenant" ? "tenant" : "owner");
    }
    // A member without an app account: the billing worker emails them (scripts/billing-worker.ts).
    if (!people.size) unreachable({ rule: "dues", stage, entity: { collection: "payment_requests", id: c.id } });
    const line: ReminderLine = { label: c.label, amount: formatMoney(c.amountRemaining), due: formatDay(due) };
    for (const [member, audience] of people) {
      emit({
        rule: "dues",
        stage,
        anchor: dayAnchor(due),
        entity: { collection: "payment_requests", id: c.id },
        member,
        audience,
        template: "reminder-dues",
        vars: {
          amount: line.amount,
          due: line.due,
          due_iso: due.toString(),
          label: c.label,
          amount_value: String(c.amountRemaining),
        },
        lines: [line],
        urgency: stage === "overdue" ? "high" : stage === "due" ? "normal" : "low",
        channels: ALL,
        essential: true,
        category: "payment",
        group: `dues:${stage}:${member}`,
      });
    }
  }
}

function meetings(snap: ReminderSnapshot, clock: ReminderClock, emit: Emit) {
  for (const m of snap.meetings) {
    if (!m.published || (m.status && m.status !== "scheduled")) continue;
    const starts = instant(m.startsAt);
    if (!Number.isFinite(starts) || starts <= clock.asOf) continue;
    let stage: "week" | "day" | "hour" | null = null;
    if (clock.asOf >= starts - HOUR_MS) stage = "hour";
    else if (clock.asOf >= starts - DAY_MS) stage = clock.awake ? "day" : null;
    else {
      const day = toCalendarDate(fromAbsolute(starts, clock.timeZone));
      if (daysBetween(clock.today, day) === 7 && clock.awake) stage = "week";
    }
    if (!stage) continue;
    const when = formatWhen(starts, clock);
    const vars = {
      title: m.title,
      when,
      time: formatTime(starts, clock.timeZone),
      date: formatDay(toCalendarDate(fromAbsolute(starts, clock.timeZone))),
      location: m.location || "",
    };
    for (const member of new Set(m.audienceUserIds)) {
      emit({
        rule: "meeting",
        stage,
        anchor: instantAnchor(starts),
        entity: { collection: "hoa_meetings", id: m.id },
        member,
        audience: "member",
        template: "reminder-meeting",
        vars,
        urgency: stage === "hour" ? "high" : stage === "day" ? "normal" : "low",
        channels: stage === "hour" ? ["push"] : ALL,
        essential: false,
        category: "meeting",
        group: `meeting:${m.id}:${stage}`,
        ...(stage === "hour" ? { ttlSeconds: Math.max(60, Math.ceil((starts - clock.asOf) / 1000)) } : {}),
      });
    }
  }
}

function requests(snap: ReminderSnapshot, clock: ReminderClock, emit: Emit) {
  const staleDays = snap.settings.rules.request.days;
  const cureDays = snap.settings.rules.violation.days;
  for (const r of snap.requests) {
    const status = r.status ?? "";

    // A violation's cure date, to the member it is about.
    if (r.type === "violation" && !CLOSED_REQUEST.has(status) && r.memberUserId) {
      const cure = localDay(r.cureBy, clock.timeZone);
      if (cure && clock.awake) {
        const after = daysBetween(cure, clock.today);
        const stage = after === 0 ? "due" : after >= -cureDays && after <= -1 ? "before" : null;
        if (stage) {
          emit({
            rule: "violation",
            stage,
            anchor: dayAnchor(cure),
            entity: { collection: "hoa_requests", id: r.id },
            member: r.memberUserId,
            audience: "violator",
            template: "reminder-violation",
            vars: { title: r.title, cure_by: formatDay(cure), days_left: String(-after) },
            urgency: stage === "due" ? "high" : "normal",
            channels: ALL,
            essential: true,
            category: "request",
            group: `violation:${r.id}:${stage}`,
          });
        }
      }
    }

    // A resident's request changed status.
    if (RESIDENT_REQUEST_TYPES.has(r.type ?? "") && STATUS_LABELS[status] && r.submittedBy) {
      const at = instant(r.statusChangedAt);
      if (Number.isFinite(at) && clock.asOf >= at && clock.asOf < at + EVENT_WINDOW_MS && clock.awake) {
        const label = r.workflowState ? humanize(r.workflowState) : STATUS_LABELS[status]!;
        emit({
          rule: "request",
          stage: "status",
          anchor: `${status}.${instantAnchor(at)}`,
          entity: { collection: "hoa_requests", id: r.id },
          member: r.submittedBy,
          audience: "submitter",
          template: "notice",
          vars: { title: r.title, status: label, path: `/requests/${r.id}` },
          urgency: "normal",
          channels: ALL,
          essential: false,
          category: "request",
          group: `request:${r.id}:status`,
        });
      }
    }

    // Nothing has happened on an open, assigned request for a week.
    if (OPEN_REQUEST.has(status) && r.assignedTo) {
      const last = localDay(r.lastActivityAt, clock.timeZone);
      if (last && daysBetween(last, clock.today) >= staleDays && clock.awake) {
        emit({
          rule: "request",
          stage: "stale",
          anchor: dayAnchor(last),
          entity: { collection: "hoa_requests", id: r.id },
          member: r.assignedTo,
          audience: "assignee",
          template: "notice",
          vars: {
            title: r.title,
            days: String(daysBetween(last, clock.today)),
            since: formatDay(last),
            path: `/requests/${r.id}`,
          },
          urgency: "low",
          channels: ["bell"],
          essential: false,
          category: "request",
          group: `request:${r.id}:stale`,
        });
      }
    }
  }
}

function polls(snap: ReminderSnapshot, clock: ReminderClock, emit: Emit) {
  if (!clock.awake) return;
  for (const p of snap.polls) {
    if (p.status !== "open" && p.status !== "closed") continue;
    const created = instant(p.createdAt);
    const closes = instant(p.closesAt);
    const closedAt = Number.isFinite(closes) && closes <= clock.asOf ? closes : NaN;

    let stage: "opened" | "closing" | "closed" | null = null;
    let anchorMs = NaN;
    if (Number.isFinite(closedAt)) {
      if (clock.asOf >= closedAt && clock.asOf < closedAt + EVENT_WINDOW_MS) {
        stage = "closed";
        anchorMs = closedAt;
      }
    } else if (p.status === "open") {
      const closingWindow = Number.isFinite(closes) && clock.asOf >= closes - DAY_MS && clock.asOf < closes;
      // A poll opened inside its last day gets "opened" (which says when it closes), not both.
      if (closingWindow && Number.isFinite(created) && created < closes - DAY_MS) {
        stage = "closing";
        anchorMs = closes;
      } else if (Number.isFinite(created) && clock.asOf >= created && clock.asOf < created + EVENT_WINDOW_MS) {
        stage = "opened";
        anchorMs = created;
      }
    }
    if (!stage) continue;

    // Someone who has voted needn't be asked to; everyone hears the result.
    const voted = new Set(p.voterUserIds);
    const audience = [...new Set(p.audienceUserIds)].filter((u) => stage === "closed" || !voted.has(u));
    const vars = {
      question: p.question,
      closes: Number.isFinite(closes) ? formatWhen(closes, clock) : "",
      result: stage === "closed" ? p.resultSentence || "" : "",
    };
    for (const member of audience) {
      emit({
        rule: "poll",
        stage,
        anchor: instantAnchor(anchorMs),
        entity: { collection: "hoa_polls", id: p.id },
        member,
        audience: "member",
        template: "reminder-poll",
        vars,
        urgency: stage === "closing" ? "normal" : "low",
        channels: ALL,
        essential: false,
        category: "announcement",
        group: `poll:${p.id}:${stage}`,
      });
    }
  }
}

function coverage(snap: ReminderSnapshot, clock: ReminderClock, emit: Emit) {
  if (!clock.awake) return;
  const lead = snap.settings.rules.coverage.days;
  for (const v of snap.vendors) {
    const ends = localDay(v.activeUntil, clock.timeZone);
    if (!ends) continue;
    const after = daysBetween(ends, clock.today);
    const stage = after >= -lead && after <= -1 ? "before" : after >= 0 && after < EXPIRED_SPAN_DAYS ? "expired" : null;
    if (!stage) continue;
    for (const member of new Set(snap.adminUserIds)) {
      emit({
        rule: "coverage",
        stage,
        anchor: dayAnchor(ends),
        entity: { collection: "hoa_vendors", id: v.id },
        member,
        audience: "admin",
        template: "notice",
        vars: { vendor: v.name, ends: formatDay(ends), days_left: String(-after), path: "/admin/vendors" },
        urgency: stage === "expired" ? "normal" : "low",
        channels: ["bell"],
        essential: false,
        category: "document",
        group: `coverage:${v.id}:${stage}`,
      });
    }
  }
}

/**
 * Every reminder due at `asOf`, enabled or not (`enabled` says which; the tick
 * sends only those, the dry run lists both). Sorted by key, so a run is stable.
 * `unreachable` hears of a due stage with nobody to send it to.
 */
export function evaluateReminders(
  snap: ReminderSnapshot,
  asOf: Date,
  unreachable: Unreachable = () => {},
  opts: { allHours?: boolean } = {}
): Reminder[] {
  // `allHours`: an event (a poll just closed) goes out when it happens, not at the
  // next send hour — the quiet hours are for the tick's day-based reminders.
  const clock = { ...reminderClock(asOf, snap.org.timeZone, snap.settings.sendHour), ...(opts.allHours ? { awake: true } : {}) };
  const out = new Map<string, Reminder>();
  const emit: Emit = ({ anchor, ...r }) => {
    const key = reminderKey(r.rule, r.entity.id, r.stage, anchor, r.member);
    const cfg = snap.settings.rules[r.rule];
    if (!out.has(key)) out.set(key, { ...r, key, enabled: cfg.enabled && cfg.stages[r.stage] !== false });
  };
  dues(snap, clock, emit, unreachable);
  meetings(snap, clock, emit);
  requests(snap, clock, emit);
  polls(snap, clock, emit);
  coverage(snap, clock, emit);
  return [...out.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Reminders that go out together, in key order of their first member. */
export function groupReminders(reminders: Reminder[]): Reminder[][] {
  const groups = new Map<string, Reminder[]>();
  for (const r of reminders) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  return [...groups.values()];
}
