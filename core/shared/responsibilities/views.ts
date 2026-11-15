/**
 * What the register's routes return, shaped from stored rows
 * (docs/spec-responsibilities.md, "What each audience reads"). Pure, so the
 * owner view's "nothing else" is a tested property of one function rather
 * than a hope about a route.
 */
import {
  basisLabel,
  cadenceLabel,
  CATEGORIES,
  categoryLabel,
  officeLabel,
  roleLabel,
  type AssigneeRole,
  type Category,
} from "./config";
import {
  holdersAsOf,
  officeHolderAsOf,
  officeTermsWithin,
  targetOf,
  unassignedSince,
  type AssigneeRow,
  type BoardTermRow,
  type TargetKind,
} from "./holders";
import { isReviewOverdue, nextReview } from "./review";

/** Display names, keyed by id. Everything read with the admin token, scoped to the org. */
export interface NameBook {
  members: Record<string, { name: string; avatar?: string | null }>;
  users: Record<string, { name: string; avatar?: string | null }>;
  vendors: Record<string, { name: string }>;
  teams: Record<string, { name: string; color?: string | null }>;
}

export const emptyNames = (): NameBook => ({ members: {}, users: {}, vendors: {}, teams: {} });

export interface TermWithName extends BoardTermRow {
  end_reason?: string | null;
  holder_name?: string | null;
  /** The member's live name, when the member row still exists. */
  member_name?: string | null;
}

export interface StoredAssignee extends AssigneeRow {
  id: string;
  responsibility: string;
  holder_name?: string | null;
  notes?: string | null;
}

export interface StoredResponsibility {
  id: string;
  title: string;
  description?: string | null;
  category: Category | string;
  cadence?: string | null;
  basis?: string | null;
  basis_reference?: string | null;
  area?: string | null;
  status?: string | null;
  last_verified?: string | null;
  last_verified_by?: string | null;
  member_visible?: boolean | null;
  project?: string | null;
  notes?: string | null;
  sort?: number | null;
  date_created?: string | null;
  date_updated?: string | null;
}

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null;

export const FORMER = "Former member";

export function termPerson(t: TermWithName): string {
  return t.member_name || t.holder_name || FORMER;
}

/** The live name of a target. An office is its label; the person is resolved separately. */
export function liveName(kind: TargetKind, value: string, names: NameBook): string {
  switch (kind) {
    case "office":
      return officeLabel(value);
    case "member":
      return names.members[value]?.name ?? FORMER;
    case "user":
      return names.users[value]?.name ?? "Former user";
    case "vendor":
      return names.vendors[value]?.name ?? "Former vendor";
    case "team":
      return names.teams[value]?.name ?? "Former team";
    case "label":
      return value;
  }
}

/** An ended row reads its frozen name; a current row reads live. */
export function displayName(row: StoredAssignee, names: NameBook): string {
  const t = targetOf(row);
  if (!t) return row.holder_name || "Unknown";
  if (row.end_date && row.holder_name) return row.holder_name;
  return liveName(t.kind, t.value, names);
}

export interface PersonRef {
  termId: string;
  memberId: string | null;
  name: string;
}

export interface HolderView {
  id: string;
  kind: TargetKind;
  /** The office key, the related id, or the label. */
  ref: string;
  name: string;
  role: AssigneeRole;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  avatar?: string | null;
  color?: string | null;
  /** Office rows holding on the as-of date: who held the office then. Empty = vacant. */
  people?: PersonRef[];
  vacant?: boolean;
  /** Office rows: every term of the office inside the row. */
  terms?: (PersonRef & { from: string | null; to: string | null; endReason: string | null })[];
}

export function holderView(row: StoredAssignee, names: NameBook, terms: readonly TermWithName[], asOf: string): HolderView {
  const t = targetOf(row);
  const kind = (t?.kind ?? "label") as TargetKind;
  const ref = t?.value ?? "";
  const v: HolderView = {
    id: row.id,
    kind,
    ref,
    name: displayName(row, names),
    role: (row.role as AssigneeRole) || "owner",
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    notes: row.notes ?? null,
  };
  if (kind === "member") v.avatar = names.members[ref]?.avatar ?? null;
  if (kind === "user") v.avatar = names.users[ref]?.avatar ?? null;
  if (kind === "team") v.color = names.teams[ref]?.color ?? null;
  if (kind === "office" && t) {
    const office = t.value as Parameters<typeof officeHolderAsOf>[1];
    const on = officeHolderAsOf(terms, office, asOf);
    v.people = on.terms.map((x) => ({ termId: x.id, memberId: idOf(x.hoa_member), name: termPerson(x) }));
    v.vacant = on.vacant;
    v.terms = officeTermsWithin(terms, office, row.start_date ?? null, row.end_date ?? null).map((c) => ({
      termId: c.term.id,
      memberId: idOf(c.term.hoa_member),
      name: termPerson(c.term),
      from: c.from,
      to: c.to,
      endReason: c.term.end_reason ?? null,
    }));
  }
  return v;
}

export interface RegisterRow extends Omit<StoredResponsibility, "last_verified_by" | "project"> {
  last_verified_by: { id: string; name: string } | null;
  project: { id: string; title: string } | null;
  evidence: { id: string; title: string | null; type: string | null }[];
  /** Holding on the as-of date. */
  holders: HolderView[];
  /** Every row, history included, newest first. */
  assignees: HolderView[];
  unassignedSince: string | null;
  nextReview: string | null;
  reviewOverdue: boolean;
}

export interface RegisterExtras {
  users?: Record<string, { name: string }>;
  projects?: Record<string, { title: string }>;
  evidence?: Record<string, { id: string; title: string | null; type: string | null }[]>;
}

const catRank = (c: string) => {
  const i = CATEGORIES.findIndex((x) => x.key === c);
  return i < 0 ? CATEGORIES.length : i;
};

const byCategoryThenSort = <T extends { category: string; sort?: number | null; title: string }>(a: T, b: T) =>
  catRank(a.category) - catRank(b.category) || (a.sort ?? 0) - (b.sort ?? 0) || a.title.localeCompare(b.title);

/** The editors' and the board's view: everything, as of `asOf`. */
export function registerRows(
  jobs: readonly StoredResponsibility[],
  assignees: readonly StoredAssignee[],
  names: NameBook,
  terms: readonly TermWithName[],
  asOf: string,
  today: string,
  extras: RegisterExtras = {}
): RegisterRow[] {
  const byJob = new Map<string, StoredAssignee[]>();
  for (const a of assignees) byJob.set(a.responsibility, [...(byJob.get(a.responsibility) ?? []), a]);
  return [...jobs].sort(byCategoryThenSort).map((j) => {
    const rows = byJob.get(j.id) ?? [];
    const verifiedBy = j.last_verified_by ? { id: j.last_verified_by, name: extras.users?.[j.last_verified_by]?.name ?? "Former user" } : null;
    const project = j.project ? { id: j.project, title: extras.projects?.[j.project]?.title ?? "Project" } : null;
    return {
      ...j,
      last_verified_by: verifiedBy,
      project,
      evidence: extras.evidence?.[j.id] ?? [],
      holders: holdersAsOf(rows, asOf).map((r) => holderView(r, names, terms, asOf)),
      assignees: [...rows]
        .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
        .map((r) => holderView(r, names, terms, asOf)),
      unassignedSince: unassignedSince(rows, asOf, j.date_created),
      nextReview: nextReview(j.cadence, j.last_verified),
      reviewOverdue: j.status !== "retired" && isReviewOverdue(j.cadence, j.last_verified, today),
    };
  });
}

// ── Owners ───────────────────────────────────────────────────────────────────

export interface PublishedWho {
  kind: TargetKind;
  name: string;
  role: AssigneeRole;
  /** Office only: who holds it today. Empty = vacant. */
  people?: string[];
}

export type PublishedRow =
  | { id: string; title: string; category: string; cadence: string | null; lastVerified: string | null; who: PublishedWho[] }
  | { id: string; title: string; category: string; unassignedSince: string };

/**
 * The owners' view, today only. Published rows: active or disputed, with
 * member_visible. Job, who, cadence, last verified — nothing else. A job
 * nobody holds is left out unless `showUnassigned`; then id, title, category
 * and the date, nothing else. "Disputed" is never said.
 */
export function publishedRows(
  jobs: readonly StoredResponsibility[],
  assignees: readonly StoredAssignee[],
  names: NameBook,
  terms: readonly TermWithName[],
  today: string,
  showUnassigned: boolean
): PublishedRow[] {
  const out: (PublishedRow & { sort?: number | null; held: boolean })[] = [];
  for (const j of jobs) {
    if (j.status === "retired" || j.member_visible === false) continue;
    const rows = assignees.filter((a) => a.responsibility === j.id);
    const holders = holdersAsOf(rows, today);
    if (holders.length) {
      out.push({
        id: j.id,
        title: j.title,
        category: j.category,
        cadence: j.cadence ?? null,
        lastVerified: j.last_verified ? String(j.last_verified).slice(0, 10) : null,
        who: holders.map((h) => {
          const v = holderView(h, names, terms, today);
          const w: PublishedWho = { kind: v.kind, name: v.name, role: v.role };
          if (v.kind === "office") w.people = (v.people ?? []).map((p) => p.name);
          return w;
        }),
        sort: j.sort,
        held: true,
      });
    } else if (showUnassigned) {
      out.push({
        id: j.id,
        title: j.title,
        category: j.category,
        unassignedSince: unassignedSince(rows, today, j.date_created)!,
        sort: j.sort,
        held: false,
      });
    }
  }
  // Unassigned lead their category.
  return out
    .sort(
      (a, b) =>
        catRank(a.category) - catRank(b.category) ||
        Number(a.held) - Number(b.held) ||
        (a.sort ?? 0) - (b.sort ?? 0) ||
        a.title.localeCompare(b.title)
    )
    .map(({ sort: _s, held: _h, ...row }) => row as PublishedRow);
}

// ── PDF ──────────────────────────────────────────────────────────────────────

/** One holder as a cell reads it: "Treasurer (Ann Lee)", "Treasurer (vacant)", "Acme (backup)". */
export function whoText(h: Pick<HolderView, "kind" | "name" | "role" | "people" | "vacant">): string {
  let s = h.name;
  if (h.kind === "office") s += h.people?.length ? ` (${h.people.map((p) => p.name).join(", ")})` : " (vacant)";
  if (h.role && h.role !== "owner") s += ` (${roleLabel(h.role).toLowerCase()})`;
  return s;
}

export interface RegisterPdfDoc {
  title: string;
  subtitle: string;
  head: string[];
  sections: { title: string; body: string[][] }[];
  footer: string;
  filename: string;
}

const longDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/** The document handed to the board: grouped by category, the as-of date in the header. */
export function registerPdfDoc(rows: readonly RegisterRow[], asOf: string, orgName: string | null | undefined, generatedAt: string): RegisterPdfDoc {
  const live = rows.filter((r) => r.status !== "retired");
  const slug = (orgName || "community").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "community";
  return {
    title: `${orgName ? `${orgName} — ` : ""}Who handles what`,
    subtitle: `As of ${longDate(asOf)}`,
    head: ["Job", "Who", "Cadence", "Basis", "Last verified"],
    sections: CATEGORIES.map((c) => ({
      title: categoryLabel(c.key),
      body: live
        .filter((r) => r.category === c.key)
        .map((r) => [
          r.title,
          r.holders.map(whoText).join("; "),
          cadenceLabel(r.cadence),
          r.basis && r.basis !== "unknown" ? [basisLabel(r.basis), r.basis_reference].filter(Boolean).join(": ") : "Unknown",
          r.last_verified ? longDate(String(r.last_verified).slice(0, 10)) : "Never",
        ]),
    })),
    footer: `Generated ${generatedAt.slice(0, 10)} · HOA Connect`,
    filename: `responsibilities-${slug}-${asOf}.pdf`,
  };
}
