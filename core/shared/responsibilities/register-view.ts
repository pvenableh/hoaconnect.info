/**
 * What the register's pages derive from the rows `GET /api/org/responsibilities`
 * returns (docs/spec-responsibilities.md): the holder filter's options, who a
 * holder filter matches, and how many jobs owners would see as unassigned.
 * Pure, so each is table-tested and the page only draws them.
 */
import { CATEGORIES, cadenceLabel, basisLabel, categoryLabel } from "./config";
import { holdsOn } from "./holders";
import { whoText, type HolderView, type PublishedRow, type PublishedWho, type RegisterRow } from "./views";

/** The `groups` AppResourceIndex takes: the five categories, in the register's order. */
export const REGISTER_GROUPS = CATEGORIES.map((c) => ({ key: c.key as string, label: c.label as string }));

/** A holder as the filter keys it: "member:<id>", "office:treasurer", "label:City of Miami Beach". */
export const holderKey = (h: Pick<HolderView, "kind" | "ref">) => `${h.kind}:${h.ref}`;

export const UNASSIGNED = "unassigned";

export interface HolderOption {
  value: string;
  label: string;
}

/**
 * Who the holder filter can pick: "Unassigned" first, then every holder on a
 * row holding on the as-of date, once each, by name. An office is one option,
 * and so is each person who holds one, so "Ann Lee" finds her jobs whether the
 * row names her or names the Treasurer.
 */
export function holderOptions(rows: readonly RegisterRow[]): HolderOption[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.status === "retired") continue;
    for (const h of r.holders) {
      seen.set(holderKey(h), h.name);
      for (const p of h.people ?? []) if (p.memberId) seen.set(`member:${p.memberId}`, p.name);
    }
  }
  const named = [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  return [{ value: UNASSIGNED, label: "Unassigned" }, ...named];
}

/** Does this job match the holder filter? "unassigned" = nobody holds it on the as-of date. */
export function matchesHolder(row: Pick<RegisterRow, "holders">, value: string): boolean {
  if (value === UNASSIGNED) return row.holders.length === 0;
  return row.holders.some((h) => holderKey(h) === value || (h.people ?? []).some((p) => !!p.memberId && `member:${p.memberId}` === value));
}

/**
 * The jobs owners would see as "Unassigned since …" if that switch were on:
 * not retired, shown to members, and with nobody holding them today. Today,
 * not the as-of date: owners read the present.
 */
export function ownersWouldSeeUnassigned(rows: readonly Pick<RegisterRow, "status" | "member_visible" | "assignees">[], today: string): number {
  return rows.filter((r) => r.status !== "retired" && r.member_visible !== false && !r.assignees.some((a) => holdsOn(a, today))).length;
}

/** What the search box matches: the job, its section and every word a row shows. */
export function registerSearchText(r: RegisterRow): (string | null | undefined)[] {
  return [r.title, r.description, categoryLabel(r.category), cadenceLabel(r.cadence), basisLabel(r.basis), r.basis_reference, ...r.holders.map(whoText)];
}

/** The holders a job is held by today, as one line. Empty when nobody holds it. */
export const whoLine = (r: Pick<RegisterRow, "holders">): string => r.holders.map(whoText).join(", ");

// ── Picking a holder ─────────────────────────────────────────────────────────

/**
 * The kinds the register's forms offer. The schema also takes a Directus user;
 * a form offers a member instead, because anyone who works for the community
 * is one, and a user with no membership here would be refused anyway.
 */
export const PICK_KINDS = [
  { key: "office", label: "A board office" },
  { key: "member", label: "A member" },
  { key: "vendor", label: "A vendor" },
  { key: "team", label: "A team" },
  { key: "label", label: "Someone else (a name)" },
] as const;
export type PickKind = (typeof PICK_KINDS)[number]["key"];

export interface HolderPick {
  kind: PickKind | "none";
  value: string;
}

/** The target columns a route takes for a pick, or null when nothing is picked yet. */
export function targetFromPick(p: HolderPick): Partial<Record<PickKind, string>> | null {
  if (p.kind === "none") return null;
  const value = p.value.trim();
  return value ? { [p.kind]: value } : null;
}

// ── The owners' view ─────────────────────────────────────────────────────────

/**
 * An owner-view holder drawn as the register draws its own: the route returns a
 * kind, a name, a role and (for an office) who holds it today, nothing else.
 */
export function publishedHolder(w: PublishedWho, index: number): HolderView {
  const people = (w.people ?? []).map((name, i) => ({ termId: `${index}:${i}`, memberId: null, name }));
  return {
    id: `${index}:${w.kind}:${w.name}`,
    kind: w.kind,
    ref: w.name,
    name: w.name,
    role: w.role,
    start_date: null,
    end_date: null,
    notes: null,
    ...(w.kind === "office" ? { people, vacant: people.length === 0 } : {}),
  };
}

/** A published row is either held (it has `who`) or unassigned (it has `unassignedSince`). */
export const isHeldRow = (r: PublishedRow): r is Extract<PublishedRow, { who: PublishedWho[] }> => "who" in r;

/** What the owners' search matches. */
export function publishedSearchText(r: PublishedRow): string[] {
  return [r.title, categoryLabel(r.category), ...(isHeldRow(r) ? [...r.who.map((w) => w.name), ...r.who.flatMap((w) => w.people ?? []), cadenceLabel(r.cadence)] : [])];
}

/** "12 October 2026": the day an owner is told a job became unassigned. */
export function unassignedSinceText(d: string): string {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y!, m! - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
