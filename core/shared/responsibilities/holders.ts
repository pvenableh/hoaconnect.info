/**
 * Who holds a job, on any date (docs/spec-responsibilities.md, "Dates").
 *
 * Dates are YYYY-MM-DD, compared as UTC dates, both ends inclusive — the rule
 * `isCurrentBoardTerm` applies to board terms, so a job and an office read the
 * same way on the same day. Pure: no Directus, no H3.
 */
import { isCurrentBoardTerm } from "../roles/role-context";
import { parseDateOnly, toDateOnly } from "../projects/schedule";
import { isOffice, ROLE_KEYS, type AssigneeRole, type Office } from "./config";

export const TARGET_KINDS = ["office", "member", "user", "vendor", "team", "label"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** The six target columns of an assignee row; relations may arrive expanded. */
export type TargetFields = Partial<Record<TargetKind, unknown>>;

export interface Target {
  kind: TargetKind;
  /** The office key, the related id, or the trimmed label. */
  value: string;
}

export type TargetResult = { ok: true; target: Target } | { ok: false; error: string };

const idOf = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id;
  return null;
};

/** Exactly one of office, member, user, vendor, team or label — the one check every route runs. */
export function validateTarget(input: TargetFields | null | undefined): TargetResult {
  const set = TARGET_KINDS.filter((k) => idOf(input?.[k]) !== null);
  if (set.length === 0) {
    return { ok: false, error: "Choose who holds it: an office, a member, a user, a vendor, a team or a name." };
  }
  if (set.length > 1) {
    return { ok: false, error: `Choose one holder per row, not ${set.join(" and ")}.` };
  }
  const kind = set[0]!;
  const value = idOf(input![kind])!;
  if (kind === "office" && !isOffice(value)) return { ok: false, error: `"${value}" is not a board office.` };
  if (kind === "label" && value.length > 200) return { ok: false, error: "Keep the name under 200 characters." };
  return { ok: true, target: { kind, value } };
}

/** The target of a stored row, or null when the row breaks the exactly-one rule. */
export function targetOf(row: TargetFields): Target | null {
  const r = validateTarget(row);
  return r.ok ? r.target : null;
}

export const sameTarget = (a: Target | null, b: Target | null): boolean =>
  !!a && !!b && a.kind === b.kind && a.value === b.value;

/** The six columns for a target, the others null: what a create writes. */
export function targetColumns(t: Target): Record<TargetKind, string | null> {
  return Object.fromEntries(TARGET_KINDS.map((k) => [k, k === t.kind ? t.value : null])) as Record<TargetKind, string | null>;
}

// ── Dates ────────────────────────────────────────────────────────────────────

const day = (v: string | null | undefined): string | null => (v ? String(v).slice(0, 10) : null);

/** d plus n days, as YYYY-MM-DD. */
export function addDays(d: string, n: number): string {
  const parsed = parseDateOnly(d);
  if (!parsed) throw new Error(`Not a date: ${d}`);
  return toDateOnly(new Date(parsed.getTime() + n * 86_400_000));
}

export const isDateOnly = (v: unknown): v is string => typeof v === "string" && parseDateOnly(v) !== null && v.length === 10;

// ── Holding ──────────────────────────────────────────────────────────────────

export interface AssigneeRow extends TargetFields {
  id?: string;
  role?: AssigneeRole | string | null;
  start_date?: string | null;
  end_date?: string | null;
  sort?: number | null;
}

/** start ≤ d and (no end or end ≥ d). A row with no start never holds. */
export function holdsOn(row: Pick<AssigneeRow, "start_date" | "end_date">, d: string): boolean {
  const start = day(row.start_date);
  const end = day(row.end_date);
  if (!start || start > d) return false;
  return !end || end >= d;
}

const roleRank = (r: string | null | undefined) => {
  const i = (ROLE_KEYS as string[]).indexOf(r || "owner");
  return i < 0 ? ROLE_KEYS.length : i;
};

/** The rows holding on `d`: owner, performs, backup, oversight; then by sort and start. */
export function holdersAsOf<R extends AssigneeRow>(rows: readonly R[], d: string): R[] {
  return rows
    .filter((r) => holdsOn(r, d))
    .sort(
      (a, b) =>
        roleRank(a.role) - roleRank(b.role) ||
        (a.sort ?? 0) - (b.sort ?? 0) ||
        String(a.start_date).localeCompare(String(b.start_date))
    );
}

/** The rows holding today (UTC). */
export function currentHolders<R extends AssigneeRow>(rows: readonly R[], today: string = toDateOnly(new Date())): R[] {
  return holdersAsOf(rows, today);
}

/**
 * The first day nobody held the job, as of `d`: the day after the latest end
 * before `d` (the date the change was entered as), else the day the job was
 * created. Null while somebody holds it.
 */
export function unassignedSince(rows: readonly AssigneeRow[], d: string, created: string | null | undefined): string | null {
  if (rows.some((r) => holdsOn(r, d))) return null;
  const ends = rows
    .map((r) => day(r.end_date))
    .filter((e): e is string => !!e && e < d)
    .sort();
  const last = ends[ends.length - 1];
  if (last) return addDays(last, 1);
  return day(created) ?? d;
}

// ── Offices ──────────────────────────────────────────────────────────────────

export interface BoardTermRow {
  id: string;
  title?: string | null;
  status?: string | null;
  term_start?: string | null;
  term_end?: string | null;
  hoa_member?: unknown;
}

export interface OfficeHolders<T extends BoardTermRow = BoardTermRow> {
  office: Office;
  /** Current terms of that office on the date; empty when vacant. Directors may be several. */
  terms: T[];
  vacant: boolean;
}

/** Who held `office` on `d`, read from the board terms. */
export function officeHolderAsOf<T extends BoardTermRow>(terms: readonly T[], office: Office, d: string): OfficeHolders<T> {
  const held = terms
    .filter((t) => t.title === office && isCurrentBoardTerm(t, d))
    .sort((a, b) => String(a.term_start ?? "").localeCompare(String(b.term_start ?? "")));
  return { office, terms: held, vacant: held.length === 0 };
}

export interface ClippedTerm<T extends BoardTermRow = BoardTermRow> {
  term: T;
  from: string | null;
  to: string | null;
}

/**
 * Every published term of `office` that overlaps [start, end] (end null = open),
 * clipped to it, in order. A mid-year resignation shows as two terms inside one
 * assignment.
 */
export function officeTermsWithin<T extends BoardTermRow>(
  terms: readonly T[],
  office: Office,
  start: string | null,
  end: string | null
): ClippedTerm<T>[] {
  const max = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
  const min = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
  return terms
    .filter((t) => t.title === office && t.status === "published")
    .filter((t) => {
      const ts = day(t.term_start);
      const te = day(t.term_end);
      if (end && ts && ts > end) return false;
      if (start && te && te < start) return false;
      return true;
    })
    .map((t) => ({ term: t, from: max(day(t.term_start), start), to: min(day(t.term_end), end) }))
    .sort((a, b) => String(a.from ?? "").localeCompare(String(b.from ?? "")));
}
