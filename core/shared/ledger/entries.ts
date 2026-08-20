/**
 * Entry builders — the pure half of every ledger writer.
 *
 * A writer is two things: a server route that changes something, and a function
 * here that says what happened. Keeping the second half pure is what makes the
 * sentence a community reads in five years testable today, and it is the reason
 * Phase 4's transition entry could be verified before anything was written to a
 * database.
 *
 * The discipline every builder follows, taken from `buildTransitionAuditEntry`:
 *
 * - **Take the decision, not the database rows.** A builder describes what was
 *   decided, so the entry cannot drift from the change that was actually made.
 * - **Name people.** "Access changed for 3 managers" is useless to the board
 *   reading it two years later, and this is the permanent copy.
 * - **Take visibility from the catalogue**, never a literal. `./events` decides
 *   who may see an event type; a builder that hardcodes a string is the drift
 *   the policy module exists to prevent.
 * - **Take `occurredAt` as an argument.** No clock in here.
 *
 * `buildTransitionAuditEntry` lives in `core/shared/transition/audit.ts` rather
 * than here: it needs the whole `TransitionPlan`, and moving it would drag the
 * planner's types into every ledger consumer. It follows the same rules.
 */

import type { LedgerActor, LedgerEntry } from "./entry";
import { LEDGER_SCHEMA_VERSION } from "./entry";
import { defaultVisibilityFor } from "./events";
import {
  MANAGER_GRANT_KEYS,
  grantLabel,
  matchPreset,
  normalizeGrants,
  type ManagerGrantKey,
} from "#core/shared/transition/grants";


export interface GrantChangeSubject {
  readonly memberId: string;
  /** The manager's name as it should read forever, even after the account goes. */
  readonly name: string;
  readonly email: string | null;
}

export interface GrantDiff {
  readonly added: readonly ManagerGrantKey[];
  readonly removed: readonly ManagerGrantKey[];
}

/**
 * What actually changed between two grant sets, in the canonical key order.
 *
 * Both sides run through `normalizeGrants` first, because stored grants are not
 * trustworthy as a shape: `hoa_members.manager_permissions` has a stale Directus
 * default of five keys predating `projects` and `activity`, so a row can come
 * back missing keys entirely. Comparing raw objects would report a permission as
 * "removed" when it was only ever absent.
 */
export function diffGrants(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): GrantDiff {
  const a = normalizeGrants(before);
  const b = normalizeGrants(after);
  return {
    added: MANAGER_GRANT_KEYS.filter((k) => !a[k] && b[k]),
    removed: MANAGER_GRANT_KEYS.filter((k) => a[k] && !b[k]),
  };
}

/** True when nothing moved — the caller should write no entry at all. */
export function isNoOpGrantChange(diff: GrantDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0;
}

function list(keys: readonly ManagerGrantKey[]): string {
  const labels = keys.map(grantLabel);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The entry for a manager's permissions changing.
 *
 * Owner-visible, because VISION names grant changes among the things owners are
 * entitled to see: who is allowed to act for a community, and on whose
 * authority. The entry records WHICH permissions moved and who moved them —
 * never why, which is deliberation and belongs nowhere near this table.
 *
 * Returns `null` when nothing changed. A ledger that fills up with "no change"
 * rows is a ledger nobody reads, and an admin who toggles a switch twice has
 * done nothing to the community.
 */
export function buildGrantChangeEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly manager: GrantChangeSubject;
  readonly before: Record<string, unknown> | null | undefined;
  readonly after: Record<string, unknown> | null | undefined;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
  /** The preset the admin picked, when they picked one rather than a single switch. */
  readonly presetKey?: string | null;
}): LedgerEntry | null {
  const diff = diffGrants(input.before, input.after);
  if (isNoOpGrantChange(diff)) return null;

  const who = input.manager.name || input.manager.email || "A property manager";
  const parts: string[] = [];
  if (diff.added.length) parts.push(`gained ${list(diff.added)}`);
  if (diff.removed.length) parts.push(`lost ${list(diff.removed)}`);

  const after = normalizeGrants(input.after);
  const nothingLeft = MANAGER_GRANT_KEYS.every((k) => !after[k]);
  const preset = matchPreset(input.after);

  // The sentence a board reads. When every permission is gone, say so plainly
  // rather than listing seven removals — "has no permissions left" is the fact
  // that matters, and it is the one an offboarding is checked against.
  const summary = nothingLeft
    ? `${who}'s management permissions were all removed.`
    : `${who} ${parts.join(" and ")}.`;

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "manager_grants_changed",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("manager_grants_changed"),
    summary,
    payload: {
      organization_name: input.organizationName,
      manager: {
        member_id: input.manager.memberId,
        name: input.manager.name || null,
        email: input.manager.email,
      },
      added: diff.added.map(grantLabel),
      removed: diff.removed.map(grantLabel),
      // The resulting arrangement, so a reader does not have to replay every
      // earlier entry to know what this manager could do afterwards.
      resulting_permissions: MANAGER_GRANT_KEYS.filter((k) => after[k]).map(grantLabel),
      preset: preset ? preset.label : null,
      preset_applied: input.presetKey ?? null,
    },
  };
}


/* ─────────────────────────────────────────────────────────────────────────────
 * document_published
 * ────────────────────────────────────────────────────────────────────────── */

export interface DocumentSubject {
  readonly documentId: string;
  /** The title as it read when it was published — the row it came from may be renamed later. */
  readonly title: string;
  readonly categoryName?: string | null;
  /** The stored file's name, so the entry still identifies the artefact after a retitle. */
  readonly fileName?: string | null;
}

/** The statuses `hoa_documents.status` actually carries. */
export type DocumentStatus = "draft" | "published" | "archived";

/**
 * Was this a publish at all?
 *
 * `draft → published` and `archived → published` both are: in each case a
 * document that the community could not read became one it can. `published →
 * published` is not — re-saving a published document changes its metadata, and
 * a library that logs every retitle is one nobody scrolls.
 */
export function isPublishTransition(
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined
): boolean {
  return String(nextStatus ?? "") === "published" && String(previousStatus ?? "") !== "published";
}

/**
 * The entry for a document entering the community's library.
 *
 * Owner-visible from the catalogue: what governs a community is the community's
 * to read, and "which version of the rules applied in March" is one of the
 * questions an association most often has to answer from a cold start years
 * later. That is why the title and the file name are both denormalized here —
 * an entry has to identify the artefact after the row has been renamed, moved
 * to another category, or deleted outright.
 *
 * **Publishing is the outcome; a draft save is not.** Nothing is written while a
 * document sits in draft, however many times it is edited — see the header of
 * `./entry` for why deliberation stays out of the record. Un-publishing is not
 * recorded here either: it is not this builder's transition, and if it ever
 * becomes record it deserves its own event type rather than a second meaning
 * for this one.
 *
 * Returns `null` when the document was already published.
 */
export function buildDocumentPublishedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly document: DocumentSubject;
  readonly previousStatus: string | null | undefined;
  readonly nextStatus?: string | null;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry | null {
  const nextStatus = input.nextStatus ?? "published";
  if (!isPublishTransition(input.previousStatus, nextStatus)) return null;

  const title =
    input.document.title?.trim() || input.document.fileName?.trim() || "An untitled document";
  const category = input.document.categoryName?.trim() || null;

  // "Restored" rather than "published" when it comes back from the archive: the
  // community saw this document before, and a board reading the feed should not
  // have to work out from two entries that it is the same document twice.
  const verb = String(input.previousStatus ?? "") === "archived" ? "restored to" : "published to";
  const where = category ? `the document library under ${category}` : "the document library";

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "document_published",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("document_published"),
    summary: `${title} was ${verb} ${where}.`,
    payload: {
      organization_name: input.organizationName,
      document_id: input.document.documentId,
      title,
      category,
      file_name: input.document.fileName ?? null,
      previous_status: input.previousStatus ?? null,
    },
  };
}


/* ─────────────────────────────────────────────────────────────────────────────
 * poll_closed
 * ────────────────────────────────────────────────────────────────────────── */

export interface PollOptionTally {
  readonly optionId: string;
  readonly label: string;
  readonly count: number;
}

export interface PollTally {
  /** In BALLOT order, not sorted by count — the payload should read like the ballot did. */
  readonly results: readonly PollOptionTally[];
  /** Votes cast. On a multiple-choice poll this exceeds the number of people. */
  readonly votesCast: number;
  /** Distinct people who voted. Counted, never named. */
  readonly voters: number;
}

/** The options with the highest count — more than one when the vote tied. */
export function pollLeaders(tally: PollTally): readonly PollOptionTally[] {
  const top = tally.results.reduce((max, r) => Math.max(max, r.count), 0);
  if (top <= 0) return [];
  return tally.results.filter((r) => r.count === top);
}

/**
 * The entry for a vote reaching its outcome.
 *
 * **The tally, never the ballot.** This builder takes counts, and there is
 * deliberately no shape in which a voter's identity could reach it — not even
 * for a poll whose `is_anonymous` flag is off, where the app shows names while
 * voting is live. A permanent, owner-visible record of how each neighbour voted
 * on the pet policy is precisely the artefact that makes a community stop using
 * the product to decide anything. The outcome is the community's record; the
 * ballot is not.
 *
 * Owner-visible from the catalogue: a decision the community made is the
 * community's to read.
 *
 * Only `open → closed` is an outcome. Closing a draft that was never put to the
 * community changes nothing that happened to it, and returns `null` — as does
 * closing a poll that was already closed.
 */
export function buildPollClosedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly poll: {
    readonly pollId: string;
    readonly title: string;
    readonly allowMultiple?: boolean | null;
    readonly closesAt?: string | null;
  };
  readonly previousStatus: string | null | undefined;
  readonly tally: PollTally;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry | null {
  if (String(input.previousStatus ?? "") !== "open") return null;

  const title = input.poll.title?.trim() || "An untitled vote";
  const leaders = pollLeaders(input.tally);
  const votes = input.tally.votesCast;

  // Three honest endings, and "nobody voted" is one of them. A poll that closed
  // with no votes is a fact about the community worth keeping, not a row to skip.
  let outcome: string;
  if (!leaders.length) {
    outcome = "closed with no votes cast";
  } else if (leaders.length > 1) {
    const names = leaders.map((l) => l.label);
    const tied = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    outcome = `closed in a tie between ${tied}, at ${leaders[0]!.count} ${
      leaders[0]!.count === 1 ? "vote" : "votes"
    } each`;
  } else {
    outcome = `closed with ${leaders[0]!.label} ahead at ${leaders[0]!.count} of ${votes} ${
      votes === 1 ? "vote" : "votes"
    }`;
  }

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "poll_closed",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("poll_closed"),
    summary: `“${title}” ${outcome}.`,
    payload: {
      organization_name: input.organizationName,
      poll_id: input.poll.pollId,
      title,
      // The full tally in ballot order, so a reader can check the arithmetic
      // rather than take the summary's word for the winner.
      results: input.tally.results.map((r) => ({ option: r.label, votes: r.count })),
      outcome: leaders.length === 1 ? leaders[0]!.label : null,
      tied: leaders.length > 1 ? leaders.map((l) => l.label) : null,
      votes_cast: votes,
      voters: input.tally.voters,
      multiple_choice: input.poll.allowMultiple === true,
      closed_scheduled_for: input.poll.closesAt ?? null,
    },
  };
}


/* ─────────────────────────────────────────────────────────────────────────────
 * expense_recorded
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A money value as a number, whatever the database handed us.
 *
 * **Directus serializes `decimal` columns as strings** ("2400.00"), and
 * `payment_expenses.amount` is one. A string reaching a formatter renders
 * "$NaN" into a permanent record — the same class of bug that made the Reports
 * tab quietly show $0.00. Coerced here, at the boundary, exactly as
 * `core/shared/reporting/ledger.ts` does it.
 */
export function toLedgerAmount(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** US dollars, for a sentence. The ledger stores the raw number alongside it. */
export function formatMoney(value: unknown, currency = "USD"): string {
  const amount = toLedgerAmount(value);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
    }).format(amount);
  } catch {
    // An unrecognised currency code must not stop an entry being written.
    return `${amount.toFixed(2)} ${(currency || "USD").toUpperCase()}`;
  }
}

export interface ExpenseSubject {
  readonly expenseId: string;
  readonly title: string;
  /** Who was paid. Named, because a vendor is not a household. */
  readonly vendor?: string | null;
  readonly categoryLabel?: string | null;
  readonly amount: unknown;
  readonly currency?: string | null;
  readonly paidDate?: string | null;
  readonly projectName?: string | null;
}

/**
 * The entry for community money going out.
 *
 * Owner-visible from the catalogue, and this is the direction that matters:
 * where the dues went is the question owners most often cannot get answered,
 * and VISION's Pillar B promises they can. An expense names a VENDOR, which is
 * a business the community paid — not a household. That asymmetry is the whole
 * reason this event and `payment_recorded` have different defaults.
 *
 * **Paid is the outcome.** A draft expense is someone typing, and an approved
 * one is a decision to spend that has not yet moved any money. The entry is
 * written when the money left, so the ledger's money category answers "what did
 * this community spend" rather than "what did it consider spending".
 *
 * Returns `null` when the expense was already paid — re-saving a paid expense
 * corrects a typo; it does not spend the money twice.
 */
export function buildExpenseRecordedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly expense: ExpenseSubject;
  readonly previousStatus: string | null | undefined;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry | null {
  if (String(input.previousStatus ?? "") === "paid") return null;

  const e = input.expense;
  const amount = toLedgerAmount(e.amount);
  const money = formatMoney(amount, e.currency ?? "USD");
  const title = e.title?.trim() || "an unnamed expense";
  const vendor = e.vendor?.trim() || null;
  const category = e.categoryLabel?.trim() || null;

  const tail = category ? `${title} (${category})` : title;
  const summary = vendor
    ? `${vendor} was paid ${money} for ${tail}.`
    : `${money} was paid for ${tail}.`;

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "expense_recorded",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("expense_recorded"),
    summary,
    payload: {
      organization_name: input.organizationName,
      expense_id: e.expenseId,
      title,
      vendor,
      category,
      // The number as well as the sentence: a reader adding up a year of
      // spending should not have to parse "$2,400.00" back out of prose.
      amount,
      currency: (e.currency || "USD").toUpperCase(),
      paid_date: e.paidDate ?? null,
      project: e.projectName ?? null,
      previous_status: input.previousStatus ?? null,
    },
  };
}
