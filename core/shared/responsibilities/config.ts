/**
 * The responsibilities register's vocabulary and its seed lists
 * (docs/spec-responsibilities.md). Pure: shared by the routes, the schema
 * script and the pages, so the choice lists cannot drift.
 */

export const CATEGORIES = [
  { key: "finance", label: "Finance" },
  { key: "building", label: "Building" },
  { key: "mechanical_safety", label: "Mechanical and safety" },
  { key: "compliance_records", label: "Compliance and records" },
  { key: "community", label: "People and community" },
] as const;
export type Category = (typeof CATEGORIES)[number]["key"];

export const CADENCES = [
  { key: "continuous", label: "Continuous" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
  { key: "as_needed", label: "As needed" },
] as const;
export type Cadence = (typeof CADENCES)[number]["key"];

export const BASES = [
  { key: "contract", label: "Contract" },
  { key: "bylaws", label: "Bylaws" },
  { key: "statute", label: "Statute" },
  { key: "resolution", label: "Board resolution" },
  { key: "practice", label: "Practice" },
  { key: "unknown", label: "Unknown" },
] as const;
export type Basis = (typeof BASES)[number]["key"];

export const STATUSES = [
  { key: "active", label: "Active" },
  { key: "disputed", label: "Disputed" },
  { key: "retired", label: "Retired" },
] as const;
export type ResponsibilityStatus = (typeof STATUSES)[number]["key"];

/** Owner first: the order holders are listed in. */
export const ROLES = [
  { key: "owner", label: "Owner" },
  { key: "performs", label: "Performs" },
  { key: "backup", label: "Backup" },
  { key: "oversight", label: "Oversight" },
] as const;
export type AssigneeRole = (typeof ROLES)[number]["key"];

/** The `hoa_board_members.title` enum, in rank order. */
export const OFFICES = [
  { key: "president", label: "President" },
  { key: "vice_president", label: "Vice President" },
  { key: "secretary", label: "Secretary" },
  { key: "treasurer", label: "Treasurer" },
  { key: "director", label: "Director" },
] as const;
export type Office = (typeof OFFICES)[number]["key"];

export const END_REASONS = [
  { key: "term_ended", label: "Term ended" },
  { key: "resigned", label: "Resigned" },
  { key: "removed", label: "Removed" },
  { key: "changed_office", label: "Changed office" },
] as const;
export type EndReason = (typeof END_REASONS)[number]["key"];

const keys = <T extends readonly { key: string }[]>(list: T) => list.map((x) => x.key) as T[number]["key"][];

export const CATEGORY_KEYS = keys(CATEGORIES);
export const CADENCE_KEYS = keys(CADENCES);
export const BASIS_KEYS = keys(BASES);
export const STATUS_KEYS = keys(STATUSES);
export const ROLE_KEYS = keys(ROLES);
export const OFFICE_KEYS = keys(OFFICES);
export const END_REASON_KEYS = keys(END_REASONS);

const labelIn = (list: readonly { key: string; label: string }[], key: string | null | undefined) =>
  list.find((x) => x.key === key)?.label ?? (key || "");

export const categoryLabel = (k: string | null | undefined) => labelIn(CATEGORIES, k);
export const cadenceLabel = (k: string | null | undefined) => labelIn(CADENCES, k);
export const basisLabel = (k: string | null | undefined) => labelIn(BASES, k);
export const roleLabel = (k: string | null | undefined) => labelIn(ROLES, k);
export const officeLabel = (k: string | null | undefined) => labelIn(OFFICES, k);
export const endReasonLabel = (k: string | null | undefined) => labelIn(END_REASONS, k);

export const isOffice = (v: unknown): v is Office => typeof v === "string" && (OFFICE_KEYS as string[]).includes(v);

// ── Seed lists ───────────────────────────────────────────────────────────────

export interface SeedRow {
  category: Category;
  title: string;
  cadence: Cadence;
}

export interface Template {
  key: string;
  /** Shown on the button: "Start from the Florida condominium list". */
  label: string;
  rows: readonly SeedRow[];
}

const seed = (category: Category, rows: [string, Cadence][]): SeedRow[] =>
  rows.map(([title, cadence]) => ({ category, title, cadence }));

/**
 * The first seed list. Labelled for its state because it names Chapter 718's
 * world (SIRS, the 40-year recertification); other states get their own.
 */
export const FLORIDA_CONDOMINIUM: Template = {
  key: "florida_condominium",
  label: "Florida condominium",
  rows: [
    ...seed("finance", [
      ["Sends dues invoices and statements to owners", "monthly"],
      ["Receives owner payments, which account", "continuous"],
      ["Records each payment against the owner ledger", "continuous"],
      ["Deposits funds", "weekly"],
      ["Tracks who is behind, AR aging", "monthly"],
      ["Sends late notices", "monthly"],
      ["Receives vendor invoices", "continuous"],
      ["Approves vendor invoices for payment", "continuous"],
      ["Pays vendors, from which account", "continuous"],
      ["Reconciles bank statements", "monthly"],
      ["Produces monthly financials", "monthly"],
      ["Keeps the official system of record", "continuous"],
      ["Prepares the annual budget", "annual"],
      ["Files tax return and annual report", "annual"],
    ]),
    ...seed("building", [
      ["Walks the building and logs problems", "weekly"],
      ["Lobby, hallway, catwalk cleaning", "weekly"],
      ["Laundry room equipment and service calls", "as_needed"],
      ["Storage and bike areas", "quarterly"],
      ["Trash, recycling, bulk pickup", "weekly"],
      ["Pest control", "monthly"],
      ["Roof, gutters, drainage checks", "quarterly"],
      ["Exterior paint, gates, fencing", "annual"],
      ["Landscaping and irrigation", "weekly"],
      ["Pool and courtyard", "weekly"],
    ]),
    ...seed("mechanical_safety", [
      ["Elevator service contract and monthly visits", "monthly"],
      ["Elevator permit and inspection certificate", "annual"],
      ["Fire extinguishers, alarms, sprinkler inspections", "annual"],
      ["Backflow and other annual inspections", "annual"],
      ["Electrical and plumbing emergencies, after hours", "as_needed"],
      ["Hurricane prep and shutdown", "annual"],
      ["Keys, fobs, gate codes, access list", "continuous"],
    ]),
    ...seed("compliance_records", [
      ["40-year recertification: engineer, City, permits", "continuous"],
      ["SIRS and reserve study", "annual"],
      ["Insurance policies, renewals, claims", "annual"],
      ["City notices, violations, code letters", "as_needed"],
      ["Vendor contracts: where kept, when they expire", "quarterly"],
      ["Bids: who collects, how many", "as_needed"],
      ["Meeting notices, minutes, official records", "monthly"],
      ["Owner files: deeds, leases, tenant approvals, estoppels", "as_needed"],
      ["Website and owner portal", "continuous"],
    ]),
    ...seed("community", [
      ["Owner complaints: who receives, who answers", "continuous"],
      ["Rules violations: who evaluates, who sends the letter", "as_needed"],
      ["Move-ins, move-outs, contractor access", "as_needed"],
      ["Owner communications: who sends, from where", "continuous"],
      ["Emergency contact for the building", "continuous"],
    ]),
  ],
};

export const TEMPLATES: readonly Template[] = [FLORIDA_CONDOMINIUM];

export const templateFor = (key: string | null | undefined): Template | undefined =>
  TEMPLATES.find((t) => t.key === key);

/** How titles are compared when a template is applied: trimmed, any case, one space. */
export const titleKey = (title: string | null | undefined): string =>
  String(title ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The seed rows a community does not have yet, in seed order. Additive and
 * idempotent: a title already present (retired rows included) is skipped.
 */
export function rowsToAdd(template: Template, existingTitles: readonly (string | null | undefined)[]): SeedRow[] {
  const have = new Set(existingTitles.map(titleKey));
  const out: SeedRow[] = [];
  for (const row of template.rows) {
    const k = titleKey(row.title);
    if (have.has(k)) continue;
    have.add(k);
    out.push(row);
  }
  return out;
}
