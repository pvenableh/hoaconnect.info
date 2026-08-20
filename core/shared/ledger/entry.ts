/**
 * What a Community Ledger entry IS — and, more importantly, what it is NOT.
 *
 * The ledger is the community's own record of itself: the things that happened
 * TO an association that a board, an owner, or a successor manager may need to
 * prove years later. It is backed by `org_audit_log`, which is append-only —
 * there is one writer (`core/server/utils/audit-log.ts`) and deliberately no
 * update or delete counterpart anywhere in this codebase.
 *
 * ── The line, and why it is here ────────────────────────────────────────────
 *
 * VISION lists "no mutable audit log, ever" under What NOT to Build, and the
 * Pillar B promise is "see what your board decided and what your manager did".
 * Both of those are about **outcomes**. So:
 *
 *   An entry records a thing that HAPPENED, on a date, that someone did.
 *
 *   It is NOT deliberation. Not drafts. Not private board chat. Not a comment
 *   thread, an AI conversation, a half-written announcement, or a page view.
 *
 * The distinction is not squeamishness, it is what makes the ledger usable. A
 * board that believes its discussions land in an owner-visible permanent record
 * stops discussing things in the product — and then the record of the decision
 * goes with them. Protecting deliberation is what keeps the outcomes worth
 * recording. This is the same line `core/shared/export/collections.ts` already
 * draws when it withholds channels and comments from a shareable export, and it
 * should stay drawn in the same place in both files.
 *
 * Two consequences a future writer should not have to rediscover:
 *
 * - **Do not add an entry for "a draft was saved" or "someone opened a page".**
 *   `hoa_activity` already exists for portal analytics and is deliberately
 *   separate; it is admin-facing operational data, not community record.
 * - **Do not write an entry that only makes sense next to the row it came
 *   from.** `summary` is the human sentence and `payload` is the machine
 *   record; between them a reader must be able to understand the entry without
 *   this codebase, and after the source row has been deleted. That is why the
 *   actor's name and email are denormalized onto every entry.
 *
 * Corrections are new entries. If an entry is wrong, the honest record is that
 * it was written and then corrected.
 *
 * Pure: no Directus, no H3, no clock.
 */

import type { LedgerEventType } from "./events";

/**
 * Who may see an entry.
 *
 * Carried per-row on `org_audit_log`. Phase 4 let its one writer choose the
 * string; from Phase 5 the choice comes from the event catalogue and the reader
 * enforces it through `./visibility`, so the answer to "may this person see
 * this?" is decided once rather than per writer.
 *
 * - `owners` — anyone with a seat in the community. Decisions, money in
 *   aggregate, who runs the place, what the AI did.
 * - `board` — the board, the org admin, and a property manager. Personnel,
 *   legal, and anything naming one member's standing.
 *
 * There is deliberately no `public` tier. A community's record is the
 * community's, and a stranger who guesses a slug is not a member of it.
 */
/**
 * The shape version stamped on every row.
 *
 * Its own constant, not the transition planner's. Phase 4 borrowed
 * `TRANSITION_SCHEMA_VERSION` because the transition was the only writer; with
 * six of them a change to the planner must not silently restamp entries written
 * by the document publisher. Bump this only when the ROW shape changes —
 * payloads differ per event type and are versioned by the reader's tolerance
 * for missing keys, not by this number.
 */
export const LEDGER_SCHEMA_VERSION = 1;

export type LedgerVisibility = "owners" | "board";

export const LEDGER_VISIBILITIES: readonly LedgerVisibility[] = ["owners", "board"];

export interface LedgerActor {
  readonly userId: string | null;
  /** Denormalized on purpose: the row must still read correctly if the account is later deleted. */
  readonly name: string;
  readonly email: string | null;
}

/**
 * One row of `org_audit_log`, as the app reads and writes it.
 *
 * `event_type` is typed as the known union OR any string on purpose. Writers get
 * autocomplete and a spell-check; readers accept rows written by a newer deploy
 * (or by a Phase 6 that added a type this build has never heard of) and render
 * them generically rather than dropping a piece of a community's history because
 * the client is out of date.
 */
export interface LedgerEntry {
  readonly schema_version: number;
  readonly organization: string;
  readonly event_type: LedgerEventType | (string & {});
  readonly occurred_at: string;
  readonly actor_user: string | null;
  readonly actor_name: string;
  readonly actor_email: string | null;
  readonly visibility: LedgerVisibility;
  /** One sentence, for a human reading the feed. */
  readonly summary: string;
  /** The structured record of what changed. */
  readonly payload: Record<string, unknown>;
}

/** A stored row, as it comes back from a read: it has an id, and may be older than this build. */
export interface StoredLedgerEntry extends LedgerEntry {
  readonly id: string;
}
