/**
 * The Data Trust export map: for every collection in the schema, how a row is
 * known to belong to one organization, and which export tier it appears in.
 *
 * This is data rather than a rule because the schema is not uniform. Most
 * collections carry an `organization` FK and scope trivially. Sixteen do not —
 * junctions and children (`hoa_channel_messages`, `hoa_meeting_attendees`,
 * `hoa_projects_files`, …) reach their org only through a parent row. And a
 * handful of collections in the same database are not community data at all:
 * the billing account belongs to the property-management agency, the coupon and
 * plan catalogs belong to the platform, and push subscriptions are device
 * tokens. Writing "everything with an organization column" would silently ship
 * an incomplete archive; writing "every collection" would hand a community
 * another party's records.
 *
 * The failure mode this file exists to prevent is a QUIET one. An export that
 * omits a collection still produces a valid-looking zip, and nobody discovers
 * the gap until a board is mid-dispute and their channel history isn't there.
 * So `unmappedCollections()` exists to be asserted in a test against the live
 * `CollectionNames` enum: adding a collection to the schema without deciding
 * where it belongs fails the build.
 *
 * Pure: no Directus, no fs, no H3.
 */

import { visibleTiersFor, type LedgerViewer } from "#core/shared/ledger/visibility";

/**
 * `full` — everything, for the community's own board.
 * `shareable` — the variant that is safe to hand an incoming manager: the
 *   operational record without the board's private deliberation.
 */
export type ExportTier = "full" | "shareable";

export const EXPORT_TIERS: readonly ExportTier[] = ["full", "shareable"] as const;

/** How rows of a collection are traced back to one organization. */
export type OrgScope =
  /** The organization row itself — filtered by primary key, not by an FK. */
  | { readonly kind: "self" }
  /** A direct FK to `hoa_organizations`. `field` is almost always `organization`. */
  | { readonly kind: "direct"; readonly field: string }
  /** No org column; reached by matching `field` against a parent's exported ids. */
  | { readonly kind: "via"; readonly parent: string; readonly field: string };

export interface CsvColumn {
  readonly header: string;
  readonly path: string;
}

/**
 * Which ROWS of a collection travel in the shareable tier.
 *
 * Redaction blanks fields; this keeps or drops whole rows. Declarative on
 * purpose — a field and a set of allowed values, not a predicate function — so
 * the worker can push it into the Directus query rather than reading everything
 * and discarding half. That matters for the same reason it matters in the
 * ledger reader: a filter applied after the read makes every count and every
 * page boundary lie, and here it would also mean withheld rows crossing the
 * wire before being thrown away.
 */
export interface RowFilter {
  readonly field: string;
  /** Rows whose `field` is one of these are kept. Everything else is dropped. */
  readonly keep: readonly string[];
  /** Why, for the manifest and for the next person reading this map. */
  readonly note: string;
}

export interface ExportEntry {
  readonly collection: string;
  /** Human name, used in the manifest and the archive README. */
  readonly label: string;
  readonly scope: OrgScope;
  readonly tiers: readonly ExportTier[];
  /**
   * Fields blanked in the `shareable` tier only. Used where a collection is
   * operationally necessary but carries something that should not travel.
   */
  readonly redact?: readonly string[];
  /**
   * Rows kept in the `shareable` tier only. Absent means every row travels.
   * `full` is verbatim by definition and never filtered.
   */
  readonly shareableRows?: RowFilter;
  /** When set, the archive also gets a human-readable CSV of this collection. */
  readonly csv?: {
    readonly file: string;
    readonly columns: readonly CsvColumn[];
  };
}

const BOTH: readonly ExportTier[] = ["full", "shareable"];
const FULL_ONLY: readonly ExportTier[] = ["full"];

/**
 * Who a `shareable` archive is written for, in the ledger's own terms: someone
 * with a seat in the community and no office in it.
 *
 * Deliberately NOT a manager, even though the archive's usual reader is an
 * incoming one. A shareable export is the copy a community can hand to anybody
 * — a successor, a lawyer, an owner who asked for it — and it stops being that
 * the moment its contents depend on who is receiving it. The board's own copy
 * is the `full` tier, which is verbatim.
 */
const SHAREABLE_ARCHIVE_VIEWER: LedgerViewer = {
  isMember: true,
  isBoard: false,
  isManager: false,
  isAdmin: false,
};

/** Shorthand for the overwhelmingly common case. */
function direct(
  collection: string,
  label: string,
  tiers: readonly ExportTier[],
  extra: Partial<ExportEntry> = {}
): ExportEntry {
  return { collection, label, scope: { kind: "direct", field: "organization" }, tiers, ...extra };
}

function via(
  collection: string,
  label: string,
  parent: string,
  field: string,
  tiers: readonly ExportTier[]
): ExportEntry {
  return { collection, label, scope: { kind: "via", parent, field }, tiers };
}

/**
 * Collections deliberately NOT exported, each with the reason it isn't the
 * community's to take. Kept as data so the completeness test can tell "decided
 * to exclude" apart from "forgot".
 */
export const PLATFORM_COLLECTIONS: Readonly<Record<string, string>> = {
  hoa_data_exports:
    "Operational metadata about the export mechanism itself. Every archive already carries its own manifest, and a list of past jobs points at archives that have since been purged — including it would also mean every archive contains its own in-progress row.",
  billing_accounts:
    "Owned by the property-management agency, not the community. Travels with the PM (Pillar A, PM portability).",
  billing_account_members:
    "Agency staff roster on the billing account — the agency's record, not the community's.",
  block_hero: "Platform marketing page content. No org column, no community meaning.",
  coupons: "Platform-wide discount catalog.",
  coupons_subscription_plans: "Junction on the platform discount catalog.",
  subscription_plans: "Platform pricing catalog — the same rows for every customer.",
  waitlist_signups: "Platform signup funnel, predates any organization.",
  push_subscriptions:
    "Browser push endpoints and encryption keys per device. Useless outside this install and a live credential — never exported.",
};

/**
 * Every exported collection.
 *
 * Tier notes — what `shareable` withholds and why:
 *   - the `ai_*` family: the board's private prompts, drafts and AI billing.
 *   - `hoa_activity`: per-person page-level activity. Operationally useless to a
 *     successor and reads as surveillance when handed over.
 *   - the channel family: internal board chat is deliberation, not record.
 *   - `hoa_comments` / `hoa_reactions`: threaded discussion on requests and
 *     documents, same reasoning as channels.
 *   - moderation and report logs: who reported or hid whom.
 *   - `hoa_email_activity`: per-recipient open and click tracking.
 *   - `coupon_usage`: the community's platform billing history.
 * `org_audit_log` is the exception to the shape of this list: it appears in
 * BOTH tiers, filtered by ROW rather than withheld whole — the shareable copy
 * carries the community's owner-visible history and leaves the board-tier
 * entries behind. See its entry.
 * Member delinquency (`payment_*`, the balance fields on `hoa_members`) stays in
 * BOTH tiers on purpose — a successor manager cannot do the job without it, and
 * withholding it would make the shareable export a courtesy rather than a
 * handover.
 */
export const EXPORT_MAP: readonly ExportEntry[] = [
  // ── The organization itself ───────────────────────────────────────────────
  {
    collection: "hoa_organizations",
    label: "Organization",
    scope: { kind: "self" },
    tiers: BOTH,
    redact: ["stripe_customer_id", "stripe_subscription_id", "stripe_connect_account_id"],
  },

  // ── People, units, households ─────────────────────────────────────────────
  direct("hoa_members", "Members", BOTH, {
    redact: ["manager_permissions"],
    csv: {
      file: "members.csv",
      columns: [
        { header: "First name", path: "first_name" },
        { header: "Last name", path: "last_name" },
        { header: "Email", path: "email" },
        { header: "Phone", path: "phone" },
        { header: "Type", path: "member_type" },
        { header: "Status", path: "status" },
        { header: "Company", path: "company" },
        { header: "Mailing address", path: "mailing_address" },
        { header: "Payment status", path: "payment_status" },
        { header: "Outstanding balance", path: "outstanding_balance" },
        { header: "Last payment date", path: "last_payment_date" },
      ],
    },
  }),
  direct("hoa_units", "Units", BOTH, {
    // `unit_number`, not `name` — hoa_units carries the number and the status
    // and nothing else. The JSON beside it is the whole row either way; these
    // columns only have to be the ones a person would open a spreadsheet for.
    csv: {
      file: "units.csv",
      columns: [
        { header: "Unit", path: "unit_number" },
        { header: "Status", path: "status" },
      ],
    },
  }),
  via("hoa_member_units", "Member–unit links", "hoa_members", "member_id", BOTH),
  via("hoa_board_members", "Board terms", "hoa_members", "hoa_member", BOTH),
  direct("hoa_vehicles", "Vehicles", BOTH),
  direct("hoa_pets", "Pets", BOTH),
  direct("hoa_leases", "Leases", BOTH),
  direct("hoa_invitations", "Invitations", BOTH),
  direct("hoa_join_requests", "Join requests", BOTH),
  direct("hoa_member_change_requests", "Member change requests", BOTH),
  direct("hoa_teams", "Teams", BOTH),
  direct("hoa_team_members", "Team membership", BOTH),
  direct("hoa_vendors", "Vendors", BOTH),

  // ── Governance and the record of decisions ────────────────────────────────
  direct("hoa_governance", "Governance documents", BOTH),
  direct("hoa_meetings", "Meetings", BOTH),
  via("hoa_meeting_attendees", "Meeting attendance", "hoa_meetings", "meeting", BOTH),
  via("hoa_meetings_files", "Meeting attachments", "hoa_meetings", "hoa_meetings_id", BOTH),
  direct("hoa_polls", "Polls", BOTH),
  direct("hoa_poll_votes", "Poll votes", BOTH),
  direct("hoa_announcements", "Announcements", BOTH),

  // ── Operations ────────────────────────────────────────────────────────────
  direct("hoa_requests", "Requests", BOTH, {
    csv: {
      file: "requests.csv",
      columns: [
        { header: "Type", path: "type" },
        { header: "Title", path: "title" },
        { header: "Status", path: "status" },
        { header: "Priority", path: "priority" },
        { header: "Category", path: "category" },
        { header: "Unit", path: "unit.unit_number" },
        { header: "Due date", path: "due_date" },
        { header: "Opened", path: "date_created" },
        { header: "Description", path: "description" },
      ],
    },
  }),
  direct("hoa_tasks", "Tasks", BOTH),
  via("hoa_tasks_users", "Task assignments", "hoa_tasks", "hoa_tasks_id", BOTH),
  direct("hoa_projects", "Projects", BOTH),
  via("hoa_projects_users", "Project assignments", "hoa_projects", "hoa_projects_id", BOTH),
  via("hoa_projects_files", "Project attachments", "hoa_projects", "hoa_projects_id", BOTH),
  via("hoa_projects_vendors", "Project vendors", "hoa_projects", "hoa_projects_id", BOTH),
  direct("hoa_project_events", "Project events", BOTH),
  via(
    "hoa_project_events_files",
    "Project event attachments",
    "hoa_project_events",
    "hoa_project_events_id",
    BOTH
  ),
  direct("hoa_amenities", "Amenities", BOTH),

  // ── Documents ─────────────────────────────────────────────────────────────
  direct("hoa_documents", "Documents", BOTH),
  direct("hoa_document_categories", "Document categories", BOTH),

  // ── Money ─────────────────────────────────────────────────────────────────
  direct("payment_requests", "Dues and invoices", BOTH),
  direct("payment_transactions", "Payments received", BOTH),
  direct("payment_expenses", "Expenses", BOTH),
  direct("payment_schedules", "Payment schedules", BOTH),

  // ── Communications ────────────────────────────────────────────────────────
  direct("hoa_emails", "Sent email", BOTH),
  via("hoa_email_recipients", "Email recipients", "hoa_emails", "email", BOTH),
  via("hoa_emails_files", "Email attachments", "hoa_emails", "hoa_emails_id", BOTH),
  direct("hoa_email_templates", "Email templates", BOTH),
  via(
    "hoa_template_blocks",
    "Template blocks",
    "hoa_email_templates",
    "template_id",
    BOTH
  ),
  direct("hoa_email_partials", "Email partials", BOTH),
  direct("hoa_newsletter_blocks", "Newsletter blocks", BOTH),
  direct("hoa_mailing_lists", "Mailing lists", BOTH),
  via(
    "hoa_mailing_list_members",
    "Mailing list membership",
    "hoa_mailing_lists",
    "mailing_list",
    BOTH
  ),

  // ── Branding / public site ────────────────────────────────────────────────
  direct("block_settings", "Site and email branding", BOTH),

  // ── Full tier only — deliberation, telemetry, platform billing ────────────
  direct("hoa_channels", "Channels", FULL_ONLY),
  via("hoa_channel_members", "Channel membership", "hoa_channels", "channel", FULL_ONLY),
  via("hoa_channel_messages", "Channel messages", "hoa_channels", "channel", FULL_ONLY),
  via("hoa_channel_mentions", "Channel mentions", "hoa_channels", "channel", FULL_ONLY),
  direct("hoa_channel_moderation_log", "Channel moderation log", FULL_ONLY),
  direct("hoa_comments", "Comments", FULL_ONLY),
  direct("hoa_reactions", "Reactions", FULL_ONLY),
  direct("hoa_comment_reports", "Comment reports", FULL_ONLY),
  direct("hoa_activity", "Portal activity", FULL_ONLY),
  // In BOTH tiers, and this is the entry the row filter was built for.
  //
  // The community's own record of itself is record, not deliberation, so a
  // handover has a fair claim on it — an archive that omitted it would hand a
  // successor the operational data and none of the history that explains it.
  // The blocker used to be that entries carry a `visibility` of owners OR board
  // while the exporter could only redact FIELDS. `shareableRows` is the missing
  // half, and the tiers it keeps are not written out here: they come from the
  // ledger's own policy module, so a change to who may see an entry reaches the
  // export in the same commit rather than in a later one that someone forgets.
  direct("org_audit_log", "Community ledger", BOTH, {
    shareableRows: {
      field: "visibility",
      keep: visibleTiersFor(SHAREABLE_ARCHIVE_VIEWER),
      note: "Owner-visible entries only. Board-tier entries — personnel, and anything naming one household's standing — stay in the community's own full export.",
    },
  }),
  direct("hoa_email_activity", "Email delivery tracking", FULL_ONLY),
  direct("coupon_usage", "Discounts applied", FULL_ONLY),
  direct("ai_wallets", "AI credit wallet", FULL_ONLY),
  direct("ai_transactions", "AI credit ledger", FULL_ONLY),
  direct("ai_conversations", "AI conversations", FULL_ONLY),
  direct("ai_messages", "AI messages", FULL_ONLY),
  direct("ai_actions", "AI action queue", FULL_ONLY),
  direct("ai_context_snapshots", "AI context snapshots", FULL_ONLY),
  direct("ai_doc_chunks", "AI document index", FULL_ONLY),
  // The community ledger re-indexed for retrieval. Derived from org_audit_log
  // and re-derivable from it, but it carries each entry's summary verbatim and
  // is org-scoped, so it follows the rest of the ai_* family into `full` rather
  // than being excluded as platform machinery.
  direct("ai_ledger_chunks", "AI ledger index", FULL_ONLY),
];

const BY_COLLECTION: ReadonlyMap<string, ExportEntry> = new Map(
  EXPORT_MAP.map((e) => [e.collection, e])
);

export function entryFor(collection: string): ExportEntry | undefined {
  return BY_COLLECTION.get(collection);
}

/** Entries included in a tier, in map order. */
export function entriesForTier(tier: ExportTier): readonly ExportEntry[] {
  return EXPORT_MAP.filter((e) => e.tiers.includes(tier));
}

/**
 * Order entries so a `via` parent always precedes its children — the worker
 * needs the parent's ids to filter by.
 *
 * Throws on an unresolvable graph (a cycle, or a child whose parent is not in
 * this set) rather than emitting a partial order, because a partial order here
 * means an archive that is quietly missing rows.
 */
export function orderEntries(entries: readonly ExportEntry[]): readonly ExportEntry[] {
  const pending = new Map(entries.map((e) => [e.collection, e]));
  const ordered: ExportEntry[] = [];
  const done = new Set<string>();

  let progressed = true;
  while (pending.size > 0 && progressed) {
    progressed = false;
    for (const [name, entry] of [...pending]) {
      const parent = entry.scope.kind === "via" ? entry.scope.parent : null;
      if (parent && !done.has(parent)) continue;
      ordered.push(entry);
      done.add(name);
      pending.delete(name);
      progressed = true;
    }
  }

  if (pending.size > 0) {
    throw new Error(
      `Unresolvable export order: ${[...pending.keys()].sort().join(", ")}`
    );
  }
  return ordered;
}

/** Entries included in a tier, parents before children. */
export function exportOrder(tier: ExportTier): readonly ExportEntry[] {
  return orderEntries(entriesForTier(tier));
}

/** The row filter that applies to this entry in this tier, or null. */
export function rowFilterFor(entry: ExportEntry, tier: ExportTier): RowFilter | null {
  if (tier !== "shareable") return null;
  return entry.shareableRows ?? null;
}

/**
 * Does this row travel in this tier?
 *
 * The worker narrows its query with the same filter, so in a correct run this
 * agrees with the query and changes nothing. It is applied anyway, on the way
 * out: a filter that silently stopped matching — a renamed column, a tier
 * spelled differently by a newer writer — would put board-only rows in an
 * archive a community hands to a stranger, and that is not a failure anyone
 * would notice from the outside. A row missing the field entirely is DROPPED,
 * because an unlabelled row is exactly the one whose visibility is unknown.
 */
export function keepsRow(
  entry: ExportEntry,
  tier: ExportTier,
  row: Record<string, unknown>
): boolean {
  const filter = rowFilterFor(entry, tier);
  if (!filter) return true;
  const value = row[filter.field];
  if (value == null) return false;
  return filter.keep.includes(String(value));
}

/**
 * Collection names that are neither mapped nor explicitly excluded. Asserted
 * empty in the test suite — see the header. `directus_*` is filtered out here
 * so callers can pass the schema's collection list unmodified.
 */
export function unmappedCollections(allCollections: readonly string[]): string[] {
  return allCollections
    .filter((name) => !name.startsWith("directus_"))
    .filter((name) => !BY_COLLECTION.has(name) && !(name in PLATFORM_COLLECTIONS))
    .sort();
}
