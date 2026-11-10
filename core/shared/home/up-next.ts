/**
 * The resident home's "Up next" (Earnest parity round 3, Phase 5b): the same
 * four things the reminders are about — dues that are due, the next meeting, a
 * poll that is closing, a request that just changed — so a push or an email
 * lands on a page that already knows. Pure: the composable fetches, this
 * decides what is worth a row and how to say it, on the community's clock and
 * in the reminders' own words (`formatDay`, `formatWhen`, `formatMoney`).
 */
import { daysBetween, formatDay, formatMoney, formatWhen, localDay, reminderClock } from "../reminders/rules";
import { DEFAULT_SEND_HOUR } from "../reminders/settings";

export interface UpNextCharge {
  id: string;
  title?: string | null;
  status?: string | null;
  amount_remaining?: number | string | null;
  due_date?: string | null;
}
export interface UpNextMeeting {
  id: string;
  title?: string | null;
  meeting_date?: string | null;
  location?: string | null;
}
export interface UpNextPoll {
  id: string;
  title?: string | null;
  closes_at?: string | null;
  /** The viewer has already voted. */
  voted: boolean;
}
export interface UpNextRequest {
  id: string;
  title?: string | null;
  type?: string | null;
  status?: string | null;
  metadata?: Record<string, any> | null;
}

export type UpNextKind = "dues" | "meeting" | "poll" | "request";

export interface UpNextItem {
  key: string;
  kind: UpNextKind;
  title: string;
  sub: string;
  /** Overdue, or due within three days. */
  urgent: boolean;
  /** Org-relative route. */
  route: string;
  icon: string;
  /** Sort key (ms): what the row is about, in time. */
  at: number;
}

export interface UpNextInput {
  charges?: UpNextCharge[];
  meetings?: UpNextMeeting[];
  polls?: UpNextPoll[];
  requests?: UpNextRequest[];
}

export interface UpNextOptions {
  asOf: Date;
  timeZone: string;
  /** Rows kept, most urgent first (default 5). */
  limit?: number;
}

const DAY_MS = 86_400_000;
const OPEN_CHARGE = new Set(["active", "partially_paid", "overdue"]);
const RESIDENT_REQUEST_TYPES = new Set(["maintenance", "arc", "complaint", "question"]);
const STATUS_LABEL: Record<string, string> = { in_progress: "In progress", waiting: "Waiting", resolved: "Resolved", closed: "Closed" };
/** How far ahead each kind looks. */
export const UP_NEXT_DUES_DAYS = 14;
export const UP_NEXT_MEETING_DAYS = 30;
export const UP_NEXT_POLL_DAYS = 14;
export const UP_NEXT_REQUEST_DAYS = 7;

const instant = (v: string | null | undefined): number => {
  if (!v) return NaN;
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`);
};
const humanize = (s: string) => s.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function buildUpNext(input: UpNextInput, opts: UpNextOptions): UpNextItem[] {
  const clock = reminderClock(opts.asOf, opts.timeZone, DEFAULT_SEND_HOUR);
  const now = opts.asOf.getTime();
  const out: UpNextItem[] = [];

  for (const c of input.charges ?? []) {
    const remaining = Number(c.amount_remaining) || 0;
    if (!OPEN_CHARGE.has(c.status ?? "") || !(remaining > 0)) continue;
    const due = localDay(c.due_date, opts.timeZone);
    if (!due) continue;
    const after = daysBetween(due, clock.today); // > 0: past the due date
    const overdue = c.status === "overdue" || after > 0;
    if (!overdue && after < -UP_NEXT_DUES_DAYS) continue;
    out.push({
      key: `dues:${c.id}`,
      kind: "dues",
      title: `${formatMoney(remaining)} · ${c.title || "Dues"}`,
      sub: overdue
        ? after > 0
          ? `Was due ${formatDay(due)} · ${plural(after, "day")} overdue`
          : `Overdue since ${formatDay(due)}`
        : after === 0
          ? "Due today"
          : after === -1
            ? `Due tomorrow, ${formatDay(due)}`
            : `Due ${formatDay(due)}`,
      urgent: overdue || after >= -3,
      route: "/payments",
      icon: "i-lucide-credit-card",
      at: Date.UTC(due.year, due.month - 1, due.day),
    });
  }

  const meetings = (input.meetings ?? [])
    .map((m) => ({ m, at: instant(m.meeting_date) }))
    .filter((x) => Number.isFinite(x.at) && x.at >= now && x.at < now + UP_NEXT_MEETING_DAYS * DAY_MS)
    .sort((a, b) => a.at - b.at)[0];
  if (meetings) {
    out.push({
      key: `meeting:${meetings.m.id}`,
      kind: "meeting",
      title: meetings.m.title || "Meeting",
      sub: `${formatWhen(meetings.at, clock)}${meetings.m.location ? ` · ${meetings.m.location}` : ""}`,
      urgent: meetings.at < now + DAY_MS,
      route: "/meetings",
      icon: "i-lucide-calendar",
      at: meetings.at,
    });
  }

  for (const p of input.polls ?? []) {
    if (p.voted) continue;
    const closes = instant(p.closes_at);
    if (Number.isFinite(closes) && (closes <= now || closes > now + UP_NEXT_POLL_DAYS * DAY_MS)) continue;
    out.push({
      key: `poll:${p.id}`,
      kind: "poll",
      title: `Vote: ${p.title || "Poll"}`,
      sub: Number.isFinite(closes) ? `Closes ${formatWhen(closes, clock)}` : "Open now",
      urgent: Number.isFinite(closes) && closes < now + DAY_MS,
      route: "/polls",
      icon: "i-lucide-vote",
      at: Number.isFinite(closes) ? closes : now + UP_NEXT_POLL_DAYS * DAY_MS,
    });
  }

  for (const r of input.requests ?? []) {
    if (!RESIDENT_REQUEST_TYPES.has(r.type ?? "") || !STATUS_LABEL[r.status ?? ""]) continue;
    const changed = instant(typeof r.metadata?.status_changed_at === "string" ? r.metadata.status_changed_at : null);
    if (!Number.isFinite(changed) || changed > now + 60_000 || changed < now - UP_NEXT_REQUEST_DAYS * DAY_MS) continue;
    const state = typeof r.metadata?.workflow_state === "string" ? humanize(r.metadata.workflow_state) : STATUS_LABEL[r.status!]!;
    out.push({
      key: `request:${r.id}`,
      kind: "request",
      title: r.title || "Your request",
      sub: `Now ${state.toLowerCase()} · ${formatWhen(changed, clock)}`,
      urgent: false,
      route: `/requests/${r.id}`,
      icon: "i-lucide-wrench",
      at: changed,
    });
  }

  // Urgent first, then soonest; an update that already happened goes after what is still ahead.
  return out
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.kind === "request" ? 1 : 0) - (b.kind === "request" ? 1 : 0) || a.at - b.at)
    .slice(0, opts.limit ?? 5);
}
