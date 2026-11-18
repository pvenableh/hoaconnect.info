/**
 * The money approval rule (docs/spec-money-approvals.md, plan decisions 16
 * and 17): who may decide an approval, how many must approve, and where it
 * stands. Every route that opens, reads or decides a `money_approvals` row
 * calls this; the client never computes it, and never sends it.
 *
 * Three inputs, and nothing else:
 *   - **seats**: the current board seats, one row per published current-term
 *     `hoa_board_members` row (isCurrentBoardTerm). One person counts once,
 *     whatever offices they hold.
 *   - **excluded**: whoever asked for the approval, and anyone who changed the
 *     amount, vendor or payee in this round. They can never decide it.
 *   - **decisions**: so far, each with the office its maker held when they
 *     made it, so a decision stays valid if its maker later leaves the board.
 *
 * Modes:
 *   - **committee**: the committee is whoever holds President, Treasurer or
 *     Secretary. It applies when at least two committee members are not
 *     excluded; two of them must approve.
 *   - **majority**: otherwise. More than half of all seats must approve
 *     (`floor(seats / 2) + 1`); excluded people count as seats but cannot
 *     vote. Never fewer than two approvals, so a board of one seat cannot
 *     approve anything: the spec's "a board too small for either rule, such as
 *     a single seat". Money going out is decided by two people.
 *
 * The HOA Admin role is not an input. An admin who holds no seat approves
 * nothing; one who holds a seat approves as that seat.
 *
 * Pure: no Directus, no clock.
 */

export const COMMITTEE_OFFICES = ["president", "treasurer", "secretary"] as const;
const COMMITTEE: ReadonlySet<string> = new Set(COMMITTEE_OFFICES);

/** Highest first: the office a person who holds several is named by. */
const OFFICE_RANK = ["president", "treasurer", "secretary", "vice_president", "director"] as const;

export const OFFICE_LABELS: Readonly<Record<string, string>> = {
  president: "President",
  vice_president: "Vice President",
  treasurer: "Treasurer",
  secretary: "Secretary",
  director: "Director",
};

export type ApprovalMode = "committee" | "majority";
/** What the rule can say of an open approval. `superseded` is stored only, never computed. */
export type RuleState = "pending" | "approved" | "rejected" | "cannot_approve";
export type DecisionValue = "approve" | "reject";

/** One current-term board row: a person and the office it holds. */
export interface Seat {
  readonly userId: string;
  readonly office: string | null | undefined;
}

export interface Decision {
  readonly userId: string;
  readonly decision: DecisionValue;
  /** The office the maker held when they decided. */
  readonly office: string | null | undefined;
}

export interface RuleInput {
  readonly seats: readonly Seat[];
  readonly excluded: readonly string[];
  readonly decisions: readonly Decision[];
}

export interface RuleView {
  readonly state: RuleState;
  readonly mode: ApprovalMode;
  /** Approvals the rule needs. */
  readonly needed: number;
  /** Approvals that count under the current mode. */
  readonly approvals: number;
  /** Rejections that count under the current mode. */
  readonly rejections: number;
  /** Approvals still needed: `needed - approvals`, never below 0. */
  readonly remaining: number;
  /** People on the board today (one per person). */
  readonly seatCount: number;
  /** People who may vote under the current mode: current seats that qualify, not excluded. */
  readonly voters: readonly string[];
  /** Voters who have not decided yet: the people this approval is waiting on. */
  readonly waitingOn: readonly string[];
  /** Board members the approval excludes. */
  readonly excludedSeats: readonly string[];
}

/** The office a person is named by when they hold several, or null for no seat. */
export function officeOf(seats: readonly Seat[], userId: string): string | null {
  const held = new Set(seats.filter((s) => s.userId === userId).map((s) => String(s.office ?? "")));
  for (const office of OFFICE_RANK) if (held.has(office)) return office;
  return null;
}

export function isCommitteeOffice(office: string | null | undefined): boolean {
  return COMMITTEE.has(String(office ?? ""));
}

/** One entry per person: their highest office. */
function people(seats: readonly Seat[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of seats) {
    if (!s.userId || out.has(s.userId)) continue;
    const office = officeOf(seats, s.userId);
    if (office) out.set(s.userId, office);
  }
  return out;
}

/** Does this person hold a committee office today? */
function holdsCommittee(seats: readonly Seat[], userId: string): boolean {
  return seats.some((s) => s.userId === userId && isCommitteeOffice(s.office));
}

/** The rule's view of one approval, from the seats as they stand now. */
export function evaluateApproval(input: RuleInput): RuleView {
  const excluded = new Set(input.excluded.filter(Boolean));
  const board = people(input.seats);
  const seatCount = board.size;

  const committee = [...board.keys()].filter((u) => holdsCommittee(input.seats, u) && !excluded.has(u));
  const mode: ApprovalMode = committee.length >= 2 ? "committee" : "majority";
  const needed = mode === "committee" ? 2 : Math.max(2, Math.floor(seatCount / 2) + 1);

  const voters = mode === "committee" ? committee : [...board.keys()].filter((u) => !excluded.has(u));

  // One decision per person (the table is unique on it; the first is kept if
  // a caller ever hands two). An excluded person's decision never counts.
  const byPerson = new Map<string, Decision>();
  for (const d of input.decisions) if (d.userId && !byPerson.has(d.userId)) byPerson.set(d.userId, d);
  const counting = [...byPerson.values()].filter(
    (d) => !excluded.has(d.userId) && (mode === "committee" ? isCommitteeOffice(d.office) : !!d.office)
  );
  const approvals = counting.filter((d) => d.decision === "approve").length;
  const rejections = counting.filter((d) => d.decision === "reject").length;
  const remaining = Math.max(0, needed - approvals);
  const waitingOn = voters.filter((u) => !byPerson.has(u));

  let state: RuleState = "pending";
  if (approvals >= needed) state = "approved";
  else if (waitingOn.length < remaining) state = rejections > 0 ? "rejected" : "cannot_approve";

  return {
    state,
    mode,
    needed,
    approvals,
    rejections,
    remaining,
    seatCount,
    voters,
    waitingOn: state === "pending" ? waitingOn : [],
    excludedSeats: [...board.keys()].filter((u) => excluded.has(u)),
  };
}

/** May this person decide now? Only while pending, and only someone it waits on. */
export function canDecide(view: Pick<RuleView, "waitingOn"> & { readonly state: string }, userId: string | null | undefined): boolean {
  return !!userId && view.state === "pending" && view.waitingOn.includes(userId);
}

/** "1 of 2 approvals" — the progress line every surface shows. */
export function progressLabel(view: Pick<RuleView, "approvals" | "needed">): string {
  return `${Math.min(view.approvals, view.needed)} of ${view.needed} approval${view.needed === 1 ? "" : "s"}`;
}
