/**
 * Restricted members: posting paused, membership kept
 * (docs/spec-member-restrictions.md).
 *
 * An admin can pause a member's posting in one community: what they write
 * stops reaching other people (chat, comments, reactions, reports, triggered
 * notifications, helper and committee areas), and what is private to them and
 * the board keeps working (reading, dues, their household, requests, bug
 * reports, poll votes, deleting their own posts). The record is
 * `hoa_member_restrictions`: dated, ended rather than erased.
 *
 * Restricted at t: a row for the membership with `starts_at ≤ t`, no
 * `lifted_at ≤ t`, and `ends_at` null or `> t`. Derived here, never stored;
 * `hoa_members.posts_in` is its mirror for Directus (core/shared/roles/
 * admin-scope.ts), kept by the sync.
 *
 * Pure: no Directus, no H3. The clock is an argument.
 */

type Ref = string | { id?: string | null } | null | undefined;

export function refId(ref: Ref): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  return ref.id ?? null;
}

/** A `hoa_member_restrictions` row as the pure helpers read it. */
export interface RestrictionRow {
  id?: string | null;
  member?: Ref;
  starts_at?: string | null;
  ends_at?: string | null;
  lifted_at?: string | null;
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Has this row ended by t: lifted at or before t, or its end date reached? */
export function endedAt(row: RestrictionRow, t: Date): boolean {
  const now = t.getTime();
  const lifted = ms(row.lifted_at);
  const ends = ms(row.ends_at);
  return (lifted !== null && lifted <= now) || (ends !== null && ends <= now);
}

/** Is this row in force at t? Start inclusive; end and lift exclusive. A row with no start is never in force. */
export function inForceAt(row: RestrictionRow, t: Date): boolean {
  const starts = ms(row.starts_at);
  if (starts === null || starts > t.getTime()) return false;
  return !endedAt(row, t);
}

/** The row in force at t, if any (the latest start when, against the rule, there are two). */
export function openRestriction<R extends RestrictionRow>(rows: readonly R[], t: Date): R | null {
  const open = rows.filter((r) => inForceAt(r, t));
  if (!open.length) return null;
  return open.sort((a, b) => (ms(b.starts_at) ?? 0) - (ms(a.starts_at) ?? 0))[0]!;
}

export function isRestrictedAt(rows: readonly RestrictionRow[], t: Date): boolean {
  return openRestriction(rows, t) !== null;
}

/** The memberships restricted at t, from rows for any number of them. */
export function restrictedMemberIds(rows: readonly RestrictionRow[], t: Date): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    const id = refId(r.member);
    if (id && inForceAt(r, t)) out.add(id);
  }
  return out;
}

/** May this member write what reaches other people? Active, and posting not paused. */
export function canPost(m: { status?: string | null; restricted: boolean }): boolean {
  return m.status === "active" && !m.restricted;
}

export const MEMBER_NOTE_MAX = 1000;
export const INTERNAL_NOTE_MAX = 2000;
/** The admin form's default length. */
export const DEFAULT_RESTRICTION_DAYS = 30;

export interface ImposeInput {
  /** That membership's rows, open and ended. */
  rows: readonly RestrictionRow[];
  now: Date;
  /** ISO; null or absent = until lifted. */
  endsAt?: string | null;
  memberNote: string;
  internalNote?: string | null;
}

export type ImposePlan =
  | { ok: true; row: { starts_at: string; ends_at: string | null; member_note: string; internal_note: string | null } }
  | { ok: false; status: 400 | 409; message: string };

/**
 * What imposing writes, or why not. One row per membership that has not
 * ended: one in force, or (never written by the route, but possible by hand)
 * one that starts later, is changed by lifting it and imposing again.
 * Membership status, the role and board terms are the route's to check.
 */
export function planImpose(input: ImposeInput): ImposePlan {
  const note = (input.memberNote ?? "").trim();
  if (!note) return { ok: false, status: 400, message: "Write the note the member will see." };
  if (note.length > MEMBER_NOTE_MAX) return { ok: false, status: 400, message: `Keep the member's note under ${MEMBER_NOTE_MAX} characters.` };
  const internal = (input.internalNote ?? "").trim();
  if (internal.length > INTERNAL_NOTE_MAX) return { ok: false, status: 400, message: `Keep the internal note under ${INTERNAL_NOTE_MAX} characters.` };
  let endsAt: string | null = null;
  if (input.endsAt) {
    const t = ms(input.endsAt);
    if (t === null) return { ok: false, status: 400, message: "That end date is not a date." };
    if (t <= input.now.getTime()) return { ok: false, status: 400, message: "The end date has to be in the future." };
    endsAt = new Date(t).toISOString();
  }
  if (input.rows.some((r) => !endedAt(r, input.now))) {
    return { ok: false, status: 409, message: "Their posting is already paused. Lift it first to change it." };
  }
  return {
    ok: true,
    row: { starts_at: input.now.toISOString(), ends_at: endsAt, member_note: note, internal_note: internal || null },
  };
}

export type LiftPlan = { ok: true; patch: { lifted_at: string; lifted_by: string } } | { ok: false; noop: true; message: string };

/** Ending a row early. A row already ended (lifted, or its date passed) is a no-op: nothing to write. */
export function planLift(row: RestrictionRow, now: Date, by: string): LiftPlan {
  if (endedAt(row, now)) return { ok: false, noop: true, message: "That pause has already ended." };
  return { ok: true, patch: { lifted_at: now.toISOString(), lifted_by: by } };
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The UTC offset of `timeZone` at `at`, in ms (positive east of UTC). */
function offsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const wall = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * When posting resumes, from the day an admin picks ("YYYY-MM-DD"): midnight
 * at the start of that day on the community's wall clock. Null when it is not
 * a real date.
 */
export function resumeInstant(day: string, timeZone: string): Date | null {
  const m = YMD.exec(day.trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  // Two passes: the offset at the guess, then at the answer (a DST change between them).
  let t = utc - offsetMs(new Date(utc), timeZone);
  t = utc - offsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** "until December 18, 2026" (the day posting resumes, on the community's clock), or "until the board lifts it". */
export function restrictionUntil(endsAt: string | null | undefined, timeZone?: string): string {
  const t = ms(endsAt);
  if (t === null) return "until the board lifts it";
  return `until ${new Date(t).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", ...(timeZone ? { timeZone } : {}) })}`;
}
