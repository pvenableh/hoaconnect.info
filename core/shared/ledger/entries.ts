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

import type { LedgerActor, LedgerEntry, LedgerVisibility } from "./entry";
import { LEDGER_SCHEMA_VERSION } from "./entry";
import { defaultVisibilityFor } from "./events";
import {
  MANAGER_GRANT_KEYS,
  grantLabel,
  matchPreset,
  normalizeGrants,
  type ManagerGrantKey,
} from "../transition/grants";


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
 * helper_grant_changed, committee_member_changed (docs/spec-delegation.md)
 * ────────────────────────────────────────────────────────────────────────── */

export interface HelperHolderSubject {
  readonly kind: "member" | "team";
  readonly id: string;
  /** The member's or the team's name as it should read forever. */
  readonly name: string;
}

/** "the Grounds committee", or "the Test committee (Session 8)" when the name already says so. */
function committeePhrase(name: string): string {
  const n = name || "unnamed";
  return /\bcommittee\b/i.test(n) ? `the ${n}` : `the ${n} committee`;
}

function holderPhrase(h: HelperHolderSubject): string {
  if (h.kind === "team") {
    const p = committeePhrase(h.name);
    return p.charAt(0).toUpperCase() + p.slice(1);
  }
  return h.name || "A member";
}

function areaList(keys: readonly string[]): string {
  return list(keys as ManagerGrantKey[]);
}

/**
 * One helper area switched on or off for a member or a committee. The caller
 * builds it only when the switch moved: a no-op writes neither the row nor this.
 */
export function buildHelperGrantEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly holder: HelperHolderSubject;
  readonly area: string;
  readonly on: boolean;
  /** The holder's open areas after the change, in grant order. */
  readonly resultingAreas: readonly string[];
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const who = holderPhrase(input.holder);
  const label = grantLabel(input.area);
  const summary = input.on ? `${who} can now work on ${label}.` : `${who} no longer works on ${label}.`;
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "helper_grant_changed",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("helper_grant_changed"),
    summary,
    payload: {
      organization_name: input.organizationName,
      holder: { kind: input.holder.kind, id: input.holder.id, name: input.holder.name || null },
      area: label,
      change: input.on ? "granted" : "ended",
      resulting_areas: input.resultingAreas.map(grantLabel),
    },
  };
}

/** Someone joined or left a committee, or their role on it changed. */
export function buildCommitteeMemberEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly team: { readonly id: string; readonly name: string };
  readonly member: { readonly memberId: string | null; readonly name: string };
  readonly change: "joined" | "left" | "role";
  readonly role: "member" | "lead";
  /** The committee's open areas, which the member gains or loses with it. */
  readonly areas: readonly string[];
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const who = input.member.name || "A member";
  const team = committeePhrase(input.team.name);
  const with_ = input.areas.length ? ` (${areaList(input.areas)})` : "";
  const summary =
    input.change === "joined"
      ? `${who} joined ${team}${input.role === "lead" ? " as its lead" : ""}${with_}.`
      : input.change === "left"
        ? `${who} left ${team}${with_}.`
        : input.role === "lead"
          ? `${who} became the lead of ${team}.`
          : `${who} is no longer the lead of ${team}.`;
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "committee_member_changed",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("committee_member_changed"),
    summary,
    payload: {
      organization_name: input.organizationName,
      team: { id: input.team.id, name: input.team.name || null },
      member: { member_id: input.member.memberId, name: input.member.name || null },
      change: input.change,
      role: input.role,
      areas: input.areas.map(grantLabel),
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
 * poll_reopened
 * ────────────────────────────────────────────────────────────────────────── */

/** "Yes and No", "Yes, No and Abstain" — a list a sentence can hold. */
function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The entry for a closed vote being opened again.
 *
 * **Why this exists at all.** `poll_closed` writes an owner-visible row saying
 * the community decided something. Reopening the poll sets that outcome aside
 * and lets the ballot change — and until this builder existed, it did so
 * silently, leaving a permanent record that asserted a decision the community
 * no longer holds. That is the same failure `ai_action_undone` was added to
 * prevent, and the same one Pillar B exists to close: a record that is
 * technically true and materially misleading is worse than no record, because
 * a board will cite it.
 *
 * **It carries the result that was set aside**, not just the fact of reopening.
 * An entry has to be readable without this codebase and after the source row is
 * gone — and the interesting question a year later is not "was it reopened" but
 * "what did it say before it was". Same tally shape as the close, so the same
 * guarantee holds: counts in ballot order, never a voter.
 *
 * Only `closed → open` is a correction. Opening a DRAFT is putting a question
 * to the community for the first time, which un-decides nothing and returns
 * `null`; so does reopening a poll that was already open.
 */
export function buildPollReopenedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly poll: {
    readonly pollId: string;
    readonly title: string;
    readonly allowMultiple?: boolean | null;
    readonly closesAt?: string | null;
  };
  readonly previousStatus: string | null | undefined;
  /** The tally as it stood at the moment of reopening — the result being set aside. */
  readonly tally: PollTally;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry | null {
  if (String(input.previousStatus ?? "") !== "closed") return null;

  const title = input.poll.title?.trim() || "An untitled vote";
  const leaders = pollLeaders(input.tally);
  const votes = input.tally.votesCast;

  let stood: string;
  if (!leaders.length) {
    stood = "no votes had been cast";
  } else if (leaders.length > 1) {
    stood = `the vote was tied between ${joinLabels(leaders.map((l) => l.label))} at ${
      leaders[0]!.count
    } ${leaders[0]!.count === 1 ? "vote" : "votes"} each`;
  } else {
    stood = `${leaders[0]!.label} was ahead at ${leaders[0]!.count} of ${votes} ${
      votes === 1 ? "vote" : "votes"
    }`;
  }

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "poll_reopened",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("poll_reopened"),
    summary: `“${title}” was reopened for voting after being closed — ${stood}.`,
    payload: {
      organization_name: input.organizationName,
      poll_id: input.poll.pollId,
      title,
      // The result being set aside, in ballot order, so the correction can be
      // read against the close it corrects without holding both rows.
      set_aside_results: input.tally.results.map((r) => ({ option: r.label, votes: r.count })),
      set_aside_outcome: leaders.length === 1 ? leaders[0]!.label : null,
      set_aside_tied: leaders.length > 1 ? leaders.map((l) => l.label) : null,
      votes_cast: votes,
      voters: input.tally.voters,
      multiple_choice: input.poll.allowMultiple === true,
      previous_status: "closed",
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
  /** Who approved it, "Jane Doe (President)", when its approval was met first. */
  readonly approvedBy?: readonly string[];
  /** Who recorded it paid. */
  readonly paidBy?: string | null;
  /** The check number or transfer reference. */
  readonly paidReference?: string | null;
  /** Recorded paid before its approval was met (docs/spec-money-approvals.md). */
  readonly paidWithoutApproval?: boolean;
}): LedgerEntry | null {
  if (String(input.previousStatus ?? "") === "paid") return null;

  const e = input.expense;
  const amount = toLedgerAmount(e.amount);
  const money = formatMoney(amount, e.currency ?? "USD");
  const title = e.title?.trim() || "an unnamed expense";
  const vendor = e.vendor?.trim() || null;
  const category = e.categoryLabel?.trim() || null;

  const tail = category ? `${title} (${category})` : title;
  // Paid before approval stays in the sentence for good: the approval can
  // follow, but the money went out first, and the record says so.
  const end = input.paidWithoutApproval ? " before it was approved." : ".";
  const summary = vendor
    ? `${vendor} was paid ${money} for ${tail}${end}`
    : `${money} was paid for ${tail}${end}`;

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
      approved_by: [...(input.approvedBy ?? [])],
      paid_by: input.paidBy ?? null,
      paid_reference: input.paidReference ?? null,
      paid_without_approval: input.paidWithoutApproval === true,
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Money approvals (docs/spec-money-approvals.md)
 * ────────────────────────────────────────────────────────────────────────── */

/** "$2,400.00 to Acme Roofing for gutter repair": what an approval is about. */
export function expensePhrase(e: Pick<ExpenseSubject, "title" | "vendor" | "amount" | "currency">): string {
  const money = formatMoney(toLedgerAmount(e.amount), e.currency ?? "USD");
  const title = e.title?.trim() || "an unnamed expense";
  const vendor = e.vendor?.trim() || null;
  return vendor ? `${money} to ${vendor} for ${title}` : `${money} for ${title}`;
}

/** "Jane Doe (President)", or the name alone when the office is unknown. */
export function nameWithOffice(name: string, officeLabel: string | null | undefined): string {
  const office = officeLabel?.trim();
  return office ? `${name} (${office})` : name;
}

/** Joins names as a sentence does: "A", "A and B", "A, B and C". */
function andList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function expensePayload(e: ExpenseSubject, organizationName: string | null) {
  return {
    organization_name: organizationName,
    expense_id: e.expenseId,
    title: e.title?.trim() || null,
    vendor: e.vendor?.trim() || null,
    amount: toLedgerAmount(e.amount),
    currency: (e.currency || "USD").toUpperCase(),
  };
}

export type MoneyApprovalKind = "spend" | "void" | "waive";

/**
 * An owner charge, as a waiver names it. It names a household, so every
 * entry and notice that carries one is the board's (`payment_recorded`).
 */
export interface ChargeSubject {
  readonly chargeId: string;
  readonly title: string;
  readonly amount: unknown;
  /** What is still owed: the part a waiver gives up. */
  readonly amountRemaining?: unknown;
  readonly currency?: string | null;
  readonly memberId?: string | null;
  /** The household's name as it reads now. */
  readonly memberName?: string | null;
}

/** What a waiver gives up: the remainder when one is known, else the whole charge. */
export function chargeWaivedAmount(c: Pick<ChargeSubject, "amount" | "amountRemaining">): number {
  return c.amountRemaining == null ? toLedgerAmount(c.amount) : toLedgerAmount(c.amountRemaining);
}

/** "a $300.00 charge to Bob Owner for March dues": what a waiver is about. */
export function chargePhrase(c: Pick<ChargeSubject, "title" | "amount" | "currency" | "memberName">): string {
  const money = formatMoney(toLedgerAmount(c.amount), c.currency ?? "USD");
  const title = c.title?.trim() || "an unnamed charge";
  const who = c.memberName?.trim() || null;
  return who ? `a ${money} charge to ${who} for ${title}` : `a ${money} charge for ${title}`;
}

function chargePayload(c: ChargeSubject, organizationName: string | null) {
  return {
    organization_name: organizationName,
    charge_id: c.chargeId,
    title: c.title?.trim() || null,
    member_id: c.memberId ?? null,
    member_name: c.memberName?.trim() || null,
    charge_amount: toLedgerAmount(c.amount),
    amount: chargeWaivedAmount(c),
    currency: (c.currency || "USD").toUpperCase(),
  };
}

/**
 * One approve or reject. Board-only: it names who voted which way, which is
 * the board's business; owners see the outcome (`expense_approved`). A
 * waiver's subject is a charge, which names a household: board-only twice.
 */
export function buildMoneyDecisionEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly approvalId: string;
  readonly kind: MoneyApprovalKind;
  readonly round: number;
  /** A spend or void's expense. */
  readonly expense?: ExpenseSubject | null;
  /** A waiver's charge. */
  readonly charge?: ChargeSubject | null;
  readonly decision: "approve" | "reject";
  /** The office label they held when they decided ("President"). */
  readonly officeLabel: string | null;
  readonly note?: string | null;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const who = nameWithOffice(input.actor.name, input.officeLabel);
  const verb = input.decision === "approve" ? "approved" : "rejected";
  const what =
    input.kind === "waive" && input.charge
      ? `waiving ${chargePhrase(input.charge)}`
      : input.kind === "void"
        ? `voiding ${expensePhrase(input.expense!)}`
        : expensePhrase(input.expense!);
  const note = input.note?.trim() || null;
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "money_decision",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("money_decision"),
    summary: `${who} ${verb} ${what}.`,
    payload: {
      ...(input.kind === "waive" && input.charge
        ? chargePayload(input.charge, input.organizationName)
        : expensePayload(input.expense!, input.organizationName)),
      approval_id: input.approvalId,
      kind: input.kind,
      round: input.round,
      decision: input.decision,
      office: input.officeLabel,
      note,
    },
  };
}

/** A spend approval met. Owner-visible, like the money going out. */
export function buildExpenseApprovedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly approvalId: string;
  readonly round: number;
  readonly expense: ExpenseSubject;
  /** "Jane Doe (President)", in the order they approved. */
  readonly approvedBy: readonly string[];
  /** It was already recorded paid: this approval ratifies it. */
  readonly ratified: boolean;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const by = input.approvedBy.length ? ` by ${andList(input.approvedBy)}` : "";
  const after = input.ratified ? ", after it was paid" : "";
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "expense_approved",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("expense_approved"),
    summary: `${expensePhrase(input.expense)} was approved${by}${after}.`,
    payload: {
      ...expensePayload(input.expense, input.organizationName),
      approval_id: input.approvalId,
      round: input.round,
      approved_by: [...input.approvedBy],
      ratified: input.ratified,
    },
  };
}

/**
 * An expense voided. Owners see it when the expense had been approved or
 * paid, because they saw that; one that never got that far stays the board's.
 */
export function buildExpenseVoidedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly expense: ExpenseSubject;
  /** The status it had: "approved" and "paid" make the entry owner-visible. */
  readonly previousStatus: string;
  readonly reason: string;
  /** The void approval's id, when it took one; null when voided at once. */
  readonly approvalId: string | null;
  readonly approvedBy?: readonly string[];
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const reason = input.reason.trim();
  const wasOut = input.previousStatus === "approved" || input.previousStatus === "paid";
  const visibility: LedgerVisibility = wasOut ? "owners" : defaultVisibilityFor("expense_voided");
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "expense_voided",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility,
    summary: `${expensePhrase(input.expense)} was voided${reason ? `: ${reason}` : ""}${/[.!?]$/.test(reason) ? "" : "."}`,
    payload: {
      ...expensePayload(input.expense, input.organizationName),
      previous_status: input.previousStatus,
      reason,
      approval_id: input.approvalId,
      approved_by: [...(input.approvedBy ?? [])],
    },
  };
}


/**
 * A waiver met: the charge is cancelled, and the community gave up what was
 * still owed. Board-only, like `payment_recorded`: it names a household, and
 * a feed of whose charges were waived is the same risk as one of who paid.
 *
 *   "A $300.00 charge to Bob Owner for March dues was waived, approved by
 *    Pat Park (President) and Sam Lee (Secretary): Storm damage."
 *
 * When part was paid first, the sentence says what was given up: "The
 * remaining $200.00 of a $300.00 charge … was waived, …".
 */
export function buildChargeWaivedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly approvalId: string;
  readonly charge: ChargeSubject;
  readonly reason: string;
  /** "Jane Doe (President)", in the order they approved. */
  readonly approvedBy: readonly string[];
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const c = input.charge;
  const reason = input.reason.trim();
  const phrase = chargePhrase(c);
  const waived = chargeWaivedAmount(c);
  const whole = toLedgerAmount(c.amount);
  const lead =
    waived < whole
      ? `The remaining ${formatMoney(waived, c.currency ?? "USD")} of ${phrase}`
      : `${phrase[0]!.toUpperCase()}${phrase.slice(1)}`;
  const by = input.approvedBy.length ? `, approved by ${andList(input.approvedBy)}` : "";
  const tail = reason ? `: ${reason}${/[.!?]$/.test(reason) ? "" : "."}` : ".";
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "charge_waived",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("charge_waived"),
    summary: `${lead} was waived${by}${tail}`,
    payload: {
      ...chargePayload(c, input.organizationName),
      approval_id: input.approvalId,
      approved_by: [...input.approvedBy],
      reason,
    },
  };
}

/** "Dec 1, 2026" for a "2026-12-01" day: the calendar day as written, no time zone. */
export function formatDay(day: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day ?? ""));
  if (!m) return String(day ?? "");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** One field of a charge an admin corrected (docs/spec-charge-corrections.md). */
export interface ChargeFieldChange {
  readonly field: "title" | "description" | "notes" | "amount" | "due_date";
  readonly from: string | number | null;
  readonly to: string | number | null;
}

const WORD_LABELS: Record<string, string> = { title: "title", description: "description", notes: "notes" };

/**
 * An admin corrected a charge without the board: raised it, renamed it, or
 * moved its date before it was due. Board-only: it names a household.
 *
 *   "Pat Park changed a $300.00 charge to Bob Diaz for March dues: amount
 *    $300.00 → $350.00, due date Dec 1, 2026 → Dec 15, 2026; edited the title."
 *
 * The phrase names the charge as it was. The words say only that they
 * changed; the payload keeps each field's before and after.
 */
export function buildChargeCorrectedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  /** The charge as it was, before the change. */
  readonly charge: ChargeSubject;
  readonly changes: readonly ChargeFieldChange[];
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const c = input.charge;
  const currency = c.currency ?? "USD";
  const parts: string[] = [];
  for (const ch of input.changes) {
    if (ch.field === "amount") parts.push(`amount ${formatMoney(ch.from, currency)} → ${formatMoney(ch.to, currency)}`);
    if (ch.field === "due_date") parts.push(`due date ${ch.from ? formatDay(String(ch.from)) : "none"} → ${formatDay(String(ch.to))}`);
  }
  const words = input.changes.filter((ch) => ch.field in WORD_LABELS).map((ch) => WORD_LABELS[ch.field]!);
  const edited = words.length ? `edited the ${andList(words)}` : "";
  const detail = [parts.join(", "), edited].filter(Boolean).join("; ");
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "charge_corrected",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("charge_corrected"),
    summary: `${input.actor.name} changed ${chargePhrase(c)}${detail ? `: ${detail}` : ""}.`,
    payload: {
      ...chargePayload(c, input.organizationName),
      changes: input.changes.map((ch) => ({ field: ch.field, from: ch.from, to: ch.to })),
    },
  };
}

/**
 * A charge withdrawn within 24 hours of being entered, before anything was
 * paid, reminded or charged late: no approval, so the Ledger is its check.
 * Board-only: it names a household.
 *
 *   "Pat Park withdrew a $300.00 charge to Bob Diaz for March dues, entered
 *    in error: Wrong month."
 */
export function buildChargeWithdrawnEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly charge: ChargeSubject;
  readonly reason: string;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const reason = input.reason.trim();
  const tail = reason ? `: ${reason}${/[.!?]$/.test(reason) ? "" : "."}` : ".";
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "charge_withdrawn",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("charge_withdrawn"),
    summary: `${input.actor.name} withdrew ${chargePhrase(input.charge)}, entered in error${tail}`,
    payload: {
      ...chargePayload(input.charge, input.organizationName),
      amount: toLedgerAmount(input.charge.amount),
      reason,
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * payment_recorded
 * ────────────────────────────────────────────────────────────────────────── */

/** How the money arrived. Kept, because "collected online" and "a manager ticked a box" are different facts. */
export type PaymentSource = "stripe" | "manual";

export interface PaymentSubject {
  readonly transactionId: string | null;
  readonly memberId: string | null;
  /** The household's name as it read when they paid. */
  readonly memberName: string | null;
  readonly unitLabel?: string | null;
  readonly amount: unknown;
  readonly currency?: string | null;
  /** What the payment was for — the charge's title, not a synthetic description. */
  readonly description?: string | null;
  /** "card", "us_bank_account", "offline". Deliberately NOT the last four digits. */
  readonly method?: string | null;
  /** The Stripe PaymentIntent id, or the manual reference. */
  readonly reference?: string | null;
}

/**
 * The entry for money arriving from one household.
 *
 * **Board-only, and this default must not be relaxed.** Every other money entry
 * describes the community; this one describes a neighbour. VISION's first named
 * risk to the entire product is a delinquency-shaming incident, and an
 * owner-visible feed of who paid what and when is the shortest path to one —
 * not because any single row is damning, but because the absence of a row is.
 * A ledger that shows nine neighbours paying in March publishes the tenth's
 * delinquency without ever mentioning them. The aggregate is owner-visible
 * through the reporting ledger; the individual payments are the board's.
 *
 * The card's last four digits are not recorded. They identify a person's
 * payment instrument and answer no question this record exists to answer.
 *
 * Only a succeeded payment for a positive amount is an outcome; a pending, a
 * failed, or a zero-amount intent returns `null`.
 */
export function buildPaymentRecordedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly payment: PaymentSubject;
  readonly status: string | null | undefined;
  readonly source: PaymentSource;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry | null {
  if (String(input.status ?? "") !== "succeeded") return null;

  const p = input.payment;
  const amount = toLedgerAmount(p.amount);
  if (amount <= 0) return null;

  const money = formatMoney(amount, p.currency ?? "USD");
  const who = p.memberName?.trim() || p.unitLabel?.trim() || "A household";
  const description = p.description?.trim() || null;
  const forWhat = description ? ` toward ${description}` : "";

  // A payment taken online and a payment a manager marked received are
  // different claims about the world, and the sentence says which it is.
  const summary =
    input.source === "manual"
      ? `${who}'s payment of ${money} was recorded${forWhat}, received outside the app.`
      : `${who} paid ${money}${forWhat}.`;

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "payment_recorded",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("payment_recorded"),
    summary,
    payload: {
      organization_name: input.organizationName,
      transaction_id: p.transactionId,
      member_id: p.memberId,
      member_name: p.memberName,
      unit: p.unitLabel ?? null,
      amount,
      currency: (p.currency || "USD").toUpperCase(),
      description,
      source: input.source,
      method: p.method ?? null,
      reference: p.reference ?? null,
    },
  };
}


/* ─────────────────────────────────────────────────────────────────────────────
 * payment_refunded
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The entry for money going BACK to a household — a Stripe refund, in full or
 * in part, of a payment `payment_recorded` already wrote. Board-only, for the
 * same reason. `amount` is THIS refund (the delta), not the cumulative total,
 * so a ledger summed over a period reconciles; `fullyRefunded` says whether
 * anything of the original payment is left.
 *
 * A zero or negative amount returns `null`: that is a replayed webhook, not an
 * event.
 */
export function buildPaymentRefundedEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly payment: PaymentSubject;
  readonly fullyRefunded: boolean;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry | null {
  const p = input.payment;
  const amount = toLedgerAmount(p.amount);
  if (amount <= 0) return null;

  const money = formatMoney(amount, p.currency ?? "USD");
  const who = p.memberName?.trim() || p.unitLabel?.trim() || "a household";
  const description = p.description?.trim() || null;
  const forWhat = description ? ` (${description})` : "";
  const summary = input.fullyRefunded
    ? `${money} was refunded to ${who}${forWhat} — the payment in full.`
    : `${money} was refunded to ${who}${forWhat} — part of the payment.`;

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "payment_refunded",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("payment_refunded"),
    summary,
    payload: {
      organization_name: input.organizationName,
      transaction_id: p.transactionId,
      member_id: p.memberId,
      member_name: p.memberName,
      unit: p.unitLabel ?? null,
      amount,
      currency: (p.currency || "USD").toUpperCase(),
      description,
      fully_refunded: input.fullyRefunded,
      reference: p.reference ?? null,
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ai_action_executed / ai_action_undone
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * AI actions whose CONTENT is board-internal, recorded board-only.
 *
 * The catalogue makes AI executions owner-visible, and that is right: "auditable
 * AI" is a slogan unless the community can see what the assistant did on its
 * behalf. But two action types carry board-internal content in their own title —
 * a board note's subject line, an internal comment — and an entry naming those
 * in an owner-visible feed would publish deliberation through the back door,
 * which is exactly the line drawn in the header of `./entry`.
 *
 * The narrowing is per action type and lives here rather than in the catalogue
 * because it is a property of the payload, not of the event: the SAME event type
 * is owner-visible for every other action the assistant takes.
 */
export const AI_ACTIONS_RECORDED_BOARD_ONLY: ReadonlySet<string> = new Set([
  "notify_board",
  "add_comment",
]);

export interface AiActionSubject {
  readonly actionId: string;
  /** Catalogue key: create_task, send_email, … */
  readonly actionType: string;
  /** The human one-line summary the approval card showed. */
  readonly title: string;
  readonly category?: string | null;
  readonly risk?: string | null;
  /** Reaches residents or the board. Outbound actions never auto-run. */
  readonly outbound?: boolean | null;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
}

/** Who let it happen: a person, or the community's trust setting. */
export type AiApproval = "human" | "automatic";

function aiVisibility(actionType: string): LedgerVisibility {
  return AI_ACTIONS_RECORDED_BOARD_ONLY.has(actionType)
    ? "board"
    : defaultVisibilityFor("ai_action_executed");
}

/**
 * The entry for an AI action that actually ran.
 *
 * This is the writer that makes "auditable AI" a claim rather than a slogan.
 * Every other pillar of the ledger records what people did; this one records
 * what a machine did on a community's behalf, and it is the only evidence an
 * owner will ever have that the autonomy dial their board set is doing what
 * they were told it does.
 *
 * Two things it deliberately says out loud:
 *
 * - **Whether a person approved it, or the trust dial did.** "The assistant did
 *   this because your board allows it to" is a different sentence from "the
 *   assistant did this because Nina said yes", and a community reading a year of
 *   history is entitled to know which it was looking at.
 * - **What kind of action it was** — category, risk, and whether it reached
 *   anyone outside the office — so the record can be audited by shape and not
 *   only read one row at a time.
 *
 * Proposals, rejections and failures are NOT recorded here. A proposal is the
 * assistant thinking, a rejection is a human declining, and a failure changed
 * nothing about the community; the ai_actions queue holds all three for the
 * board's review screen. Only `executed` is an outcome.
 */
export function buildAiActionEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly action: AiActionSubject;
  readonly status: string | null | undefined;
  readonly approval: AiApproval;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry | null {
  if (String(input.status ?? "") !== "executed") return null;

  const a = input.action;
  const title = a.title?.trim() || "an unnamed action";

  const summary =
    input.approval === "automatic"
      ? `An AI action ran automatically under the community's trust settings: ${title}.`
      : `${input.actor.name} approved an AI action: ${title}.`;

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "ai_action_executed",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: aiVisibility(a.actionType),
    summary,
    payload: {
      organization_name: input.organizationName,
      action_id: a.actionId,
      action_type: a.actionType,
      title,
      category: a.category ?? null,
      risk: a.risk ?? null,
      outbound: a.outbound === true,
      approval: input.approval,
      entity_type: a.entityType ?? null,
      entity_id: a.entityId ?? null,
    },
  };
}

/**
 * The entry for an executed AI action being reversed.
 *
 * Written wherever the execution was written, and at the same visibility — an
 * undo that a reader cannot see turns the execution entry into a lie by
 * omission. This is the "corrections are new entries" rule applied to the one
 * actor that cannot be asked what it meant.
 */
export function buildAiActionUndoneEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly action: AiActionSubject;
  readonly undone: boolean;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry | null {
  // Nothing was reverted — an undo that found nothing to undo is not an event.
  if (!input.undone) return null;

  const a = input.action;
  const title = a.title?.trim() || "an unnamed action";

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "ai_action_undone",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: aiVisibility(a.actionType),
    summary: `${input.actor.name} undid an AI action: ${title}.`,
    payload: {
      organization_name: input.organizationName,
      action_id: a.actionId,
      action_type: a.actionType,
      title,
      entity_type: a.entityType ?? null,
      entity_id: a.entityId ?? null,
    },
  };
}


/* ─────────────────────────────────────────────────────────────────────────────
 * billing_run
 * ────────────────────────────────────────────────────────────────────────── */

export interface BillingRunCounts {
  /** Dues charges inserted from schedules. */
  readonly charges: number;
  readonly chargesAmount: unknown;
  readonly lateFees: number;
  readonly lateFeesAmount: unknown;
  /** Autopay attempts made (succeeded + failed). */
  readonly autopayAttempted: number;
  readonly autopaySucceeded: number;
  readonly autopayAmount: unknown;
  readonly reminders: number;
}

/**
 * One entry per worker run per org, written only when the run did something.
 * A run that generated nothing is not an event; a nightly "nothing happened"
 * row would bury the ones that matter.
 *
 * The actor is the system: nobody with a session ran it.
 */
export function buildBillingRunEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly asOf: string;
  readonly counts: BillingRunCounts;
  readonly dryRun?: boolean;
  readonly occurredAt: string;
}): LedgerEntry | null {
  const c = input.counts;
  const total = c.charges + c.lateFees + c.autopayAttempted + c.reminders;
  if (total <= 0 || input.dryRun) return null;

  const parts: string[] = [];
  if (c.charges > 0) {
    parts.push(`generated ${c.charges} ${c.charges === 1 ? "charge" : "charges"} (${formatMoney(c.chargesAmount)})`);
  }
  if (c.lateFees > 0) {
    parts.push(`applied ${c.lateFees} late ${c.lateFees === 1 ? "fee" : "fees"} (${formatMoney(c.lateFeesAmount)})`);
  }
  if (c.autopayAttempted > 0) {
    parts.push(
      `ran autopay for ${c.autopayAttempted} ${c.autopayAttempted === 1 ? "member" : "members"} (${c.autopaySucceeded} succeeded, ${formatMoney(c.autopayAmount)})`,
    );
  }
  if (c.reminders > 0) {
    parts.push(`sent ${c.reminders} ${c.reminders === 1 ? "reminder" : "reminders"}`);
  }

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "billing_run",
    occurred_at: input.occurredAt,
    actor_user: null,
    actor_name: "Billing worker",
    actor_email: null,
    visibility: defaultVisibilityFor("billing_run"),
    summary: `Billing run for ${input.asOf}: ${parts.join(", ")}.`,
    payload: {
      organization_name: input.organizationName,
      as_of: input.asOf,
      charges: c.charges,
      charges_amount: toLedgerAmount(c.chargesAmount),
      late_fees: c.lateFees,
      late_fees_amount: toLedgerAmount(c.lateFeesAmount),
      autopay_attempted: c.autopayAttempted,
      autopay_succeeded: c.autopaySucceeded,
      autopay_amount: toLedgerAmount(c.autopayAmount),
      reminders: c.reminders,
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * member_email_status_cleared
 * ────────────────────────────────────────────────────────────────────────── */

export interface EmailStatusClearedSubject {
  readonly memberId: string;
  readonly name: string;
  readonly email: string | null;
}

/**
 * An admin cleared a member's bounced address or community opt-out. The entry
 * keeps what was cleared — the bounce's reason, the opt-out's source and date —
 * because once the flag is gone that is the only copy of why it was set.
 */
export function buildEmailStatusClearedEntry(input: {
  readonly organizationId: string;
  readonly member: EmailStatusClearedSubject;
  readonly cleared: "bounced" | "opt_out";
  /** The state being cleared, as it stood: `{ reason, at }` or `{ source, at }`. */
  readonly previous: { readonly reason?: string | null; readonly source?: string | null; readonly at?: string | null };
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const who = input.member.name || input.member.email || "A member";
  const summary =
    input.cleared === "bounced"
      ? `${who}'s bounced email address was cleared; mail to it resumes.`
      : `${who} was put back on community email after opting out.`;
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "member_email_status_cleared",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("member_email_status_cleared"),
    summary,
    payload: {
      member: { member_id: input.member.memberId, name: input.member.name || null, email: input.member.email },
      cleared: input.cleared,
      previous_reason: input.previous.reason ?? null,
      previous_source: input.previous.source ?? null,
      previous_at: input.previous.at ?? null,
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * member_restricted, member_restriction_lifted (docs/spec-member-restrictions.md)
 * ────────────────────────────────────────────────────────────────────────── */

export interface RestrictedMemberSubject {
  readonly memberId: string;
  readonly name: string;
}

/**
 * An admin paused a member's posting, or lifted a pause early. The entry keeps
 * the dates and the note the member was shown; never the board's internal note.
 */
export function buildMemberRestrictionEntry(input: {
  readonly organizationId: string;
  readonly member: RestrictedMemberSubject;
  readonly change: "restricted" | "lifted";
  readonly startsAt: string;
  /** When posting resumes on its own; null = until lifted. */
  readonly endsAt: string | null;
  /** "until December 18, 2026" or "until the board lifts it" (restrictionUntil). */
  readonly until: string;
  readonly memberNote: string;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
}): LedgerEntry {
  const who = input.member.name || "A member";
  const summary =
    input.change === "restricted" ? `${who}'s posting was paused ${input.until}.` : `${who}'s posting pause was lifted; they can post again.`;
  const event_type = input.change === "restricted" ? "member_restricted" : "member_restriction_lifted";
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type,
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor(event_type),
    summary,
    payload: {
      member: { member_id: input.member.memberId, name: input.member.name || null },
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      member_note: input.memberNote,
    },
  };
}
