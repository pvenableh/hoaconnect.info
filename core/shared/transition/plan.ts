/**
 * The Management Transition plan: what changing property managers actually does
 * to a community, in the order it has to happen, decided before anything is
 * written.
 *
 * Today the platform has one operation for this — `detach-org.post.ts` — and it
 * does two things in a single write: clears the billing account and sets
 * `subscription_status: "expired"`. A board whose manager leaves is locked out
 * that instant, holding an account they can no longer open, with nothing in the
 * record saying what happened. That is the incumbent behaviour we sell against,
 * shipped by us.
 *
 * What replaces it is not one bigger write. It is a plan — computed, shown to
 * the admin in full, and only then executed:
 *
 *   1. promote a successor to HOA Admin      ← FIRST, always
 *   2. revoke the outgoing manager's grants
 *   3. deactivate the outgoing manager's membership (never delete it)
 *   4. end-date the management vendor row
 *   5. detach billing and open a grace window instead of expiring
 *   6. offer the outgoing manager a shareable export
 *   7. write one immutable audit entry
 *
 * **Step 1 is first for a reason that is easy to get wrong.** Revoking before
 * promoting leaves a window — however short, and a failed request makes it
 * permanent — in which the community has no administrator at all, which is to
 * say: nobody who can export the data, invite anyone, or undo the mistake. The
 * ordering is the safety property, so it lives here as data and is asserted in
 * the tests rather than being an emergent property of route code.
 *
 * The planner's other job is refusing. `add-property.post.ts` creates an org
 * with the *agency* as its only HOA Admin, so "the manager leaves" can genuinely
 * mean "nobody is left" — that is a blocker, not a warning, and the fix (invite
 * a board member first) belongs in front of the admin before they commit.
 *
 * Pure: no Directus, no H3, no clock. The caller supplies `now` and resolves
 * Directus role ids to `RoleKind` — this module never learns an env var.
 */

import { MANAGER_GRANT_KEYS, type ManagerGrants } from "./grants";

/** Bumped when the shape of a persisted plan or audit payload changes. */
export const TRANSITION_SCHEMA_VERSION = 1;

/**
 * How long a detached community keeps working while it sorts out its own
 * billing. VISION Pillar A says 60 days; the number lives here so the planner,
 * the execute route and the UI copy cannot disagree about it.
 */
export const TRANSITION_GRACE_DAYS = 60;

/** What a membership row means, after the caller maps Directus role ids. */
export type RoleKind = "hoa_admin" | "property_manager" | "member";

export type MemberStatus = "active" | "inactive" | "pending" | "archived";

export type BoardTitle =
  | "president"
  | "vice_president"
  | "secretary"
  | "treasurer"
  | "director";

/** Board seniority, most senior first — used only to order successor choices. */
const BOARD_TITLE_ORDER: readonly BoardTitle[] = [
  "president",
  "vice_president",
  "secretary",
  "treasurer",
  "director",
];

export interface MemberSnapshot {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly userId: string | null;
  readonly roleKind: RoleKind;
  readonly status: MemberStatus;
  readonly isBoardMember: boolean;
  readonly boardTitle: BoardTitle | null;
  /** Whether this row currently holds any manager grant worth revoking. */
  readonly hasGrants: boolean;
  /**
   * This membership belongs to the management company, not the community —
   * resolved by the caller from the agency's billing-account roster.
   *
   * Load-bearing, and the reason it is a field rather than an inference: an
   * agency's staff routinely hold `hoa_admin` on orgs they created
   * (`add-property.post.ts` makes the creating agency the HOA Admin outright),
   * so "the property managers are leaving" would otherwise leave the agency
   * holding the account's admin seat — the exact lock-in a transition exists to
   * undo. Agency staff are offboarded by default and can never be successors.
   */
  readonly isAgencyStaff?: boolean;
}

export interface VendorSnapshot {
  readonly id: string;
  readonly company: string | null;
  readonly status: "active" | "inactive" | "archived" | null;
  /** Already end-dated when set — the plan will not touch it again. */
  readonly activeUntil: string | null;
  readonly userId: string | null;
  readonly memberId: string | null;
}

export interface OrgSnapshot {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** Set when the org bills through an agency's billing account. */
  readonly billingAccountId: string | null;
  readonly subscriptionStatus: string | null;
  readonly isFreeAccount: boolean;
  /** A grace window already open, if a transition is in flight. */
  readonly graceEndsAt: string | null;
}

export interface TransitionInput {
  readonly organization: OrgSnapshot;
  readonly members: readonly MemberSnapshot[];
  /** `hoa_vendors` rows in the `management` category for this org. */
  readonly managementVendors: readonly VendorSnapshot[];
  /** The member who will hold HOA Admin afterwards. */
  readonly successorMemberId?: string | null;
  /** Who is leaving. Defaults to every active property manager on the org. */
  readonly outgoingMemberIds?: readonly string[] | null;
  /** Offer the departing manager a shareable export of their own work. */
  readonly includeExportForOutgoing?: boolean;
  /** ISO timestamp. Supplied, never read from the clock — this module is pure. */
  readonly now: string;
  readonly graceDays?: number;
}

export type StepKind =
  | "promote_admin"
  | "revoke_grants"
  | "deactivate_member"
  | "end_vendor"
  | "detach_billing"
  | "open_grace"
  | "offer_export"
  | "write_audit";

export interface TransitionStep {
  readonly kind: StepKind;
  /** One line, written for the admin about to approve it. */
  readonly label: string;
  readonly detail: string;
  /** Row ids this step writes to, in the collection implied by `kind`. */
  readonly targetIds: readonly string[];
}

export type BlockerCode =
  | "successor_required"
  | "no_eligible_successor"
  | "successor_not_found"
  | "successor_ineligible"
  | "nothing_to_do";

export type WarningCode =
  | "transition_in_flight"
  | "no_management_vendor"
  | "vendor_already_ended"
  | "free_account_no_grace"
  | "self_billed_no_detach"
  | "successor_not_on_board";

export interface TransitionIssue {
  readonly code: BlockerCode | WarningCode;
  readonly message: string;
}

export interface TransitionPlan {
  readonly schemaVersion: number;
  /** Empty means the plan is safe to execute. */
  readonly blockers: readonly TransitionIssue[];
  readonly warnings: readonly TransitionIssue[];
  readonly steps: readonly TransitionStep[];
  readonly successor: MemberSnapshot | null;
  readonly outgoing: readonly MemberSnapshot[];
  /** ISO instant the community's grace window closes, when one opens. */
  readonly graceEndsAt: string | null;
  readonly canExecute: boolean;
}

/** Add whole days to an ISO instant, returning an ISO instant. */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid timestamp: ${iso}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function displayName(m: MemberSnapshot): string {
  return m.name?.trim() || m.email || "this member";
}

/**
 * Label a step that reads differently for one subject than for several.
 * Exists so the singular branch can name the person without TypeScript having
 * to be told, via `!`, that a one-element array has a first element.
 */
function subjectLabel<T>(
  list: readonly T[],
  one: (item: T) => string,
  many: (count: number) => string
): string {
  const [first] = list;
  return list.length === 1 && first !== undefined ? one(first) : many(list.length);
}

/**
 * Who could hold HOA Admin after the transition, best first.
 *
 * Board members outrank ordinary members and are ordered by seniority, because
 * "who should run the account" is a question the community already answered
 * when it elected them. Property managers and the management company's own
 * staff are never eligible — handing admin to the manager instead of the board
 * is precisely the arrangement the transition exists to end.
 *
 * Exported for the picker in the wizard: the UI shows this list, and the
 * planner validates against the same function.
 */
export function eligibleSuccessors(
  input: TransitionInput
): readonly MemberSnapshot[] {
  const outgoing = new Set(resolveOutgoingIds(input));
  return [...input.members]
    .filter(
      (m) =>
        m.status === "active" &&
        m.roleKind !== "property_manager" &&
        // Even when a caller offboards a narrower set, the agency's own people
        // are never the answer to "who should hold this community's account".
        m.isAgencyStaff !== true &&
        !outgoing.has(m.id)
    )
    .sort((a, b) => {
      if (a.isBoardMember !== b.isBoardMember) return a.isBoardMember ? -1 : 1;
      const ai = a.boardTitle ? BOARD_TITLE_ORDER.indexOf(a.boardTitle) : 99;
      const bi = b.boardTitle ? BOARD_TITLE_ORDER.indexOf(b.boardTitle) : 99;
      if (ai !== bi) return ai - bi;
      return displayName(a).localeCompare(displayName(b));
    });
}

/**
 * Who is leaving: the explicit list, or — by default — every active property
 * manager AND every active agency staff membership, whatever role it holds.
 * The second half is the one that matters; see `isAgencyStaff`.
 */
function resolveOutgoingIds(input: TransitionInput): readonly string[] {
  if (input.outgoingMemberIds?.length) return input.outgoingMemberIds;
  return input.members
    .filter(
      (m) =>
        m.status === "active" &&
        (m.roleKind === "property_manager" || m.isAgencyStaff === true)
    )
    .map((m) => m.id);
}

/**
 * Build the plan. Never throws on bad *data* — an impossible transition comes
 * back as blockers so the wizard can explain it, which is the whole reason this
 * is a plan and not a procedure.
 */
export function planTransition(input: TransitionInput): TransitionPlan {
  const { organization: org, now } = input;
  const graceDays = input.graceDays ?? TRANSITION_GRACE_DAYS;

  const outgoingIds = new Set(resolveOutgoingIds(input));
  const byId = new Map(input.members.map((m) => [m.id, m]));
  const outgoing = [...outgoingIds]
    .map((id) => byId.get(id))
    .filter((m): m is MemberSnapshot => Boolean(m));

  const blockers: TransitionIssue[] = [];
  const warnings: TransitionIssue[] = [];
  const steps: TransitionStep[] = [];

  // ── Who holds admin when this is over ────────────────────────────────────
  const remainingAdmins = input.members.filter(
    (m) => m.roleKind === "hoa_admin" && m.status === "active" && !outgoingIds.has(m.id)
  );
  const candidates = eligibleSuccessors(input);
  const needsSuccessor = remainingAdmins.length === 0;

  let successor: MemberSnapshot | null = null;

  if (input.successorMemberId) {
    const chosen = byId.get(input.successorMemberId);
    if (!chosen) {
      blockers.push({
        code: "successor_not_found",
        message: "The person chosen to take over is not a member of this community.",
      });
    } else if (!candidates.some((c) => c.id === chosen.id)) {
      blockers.push({
        code: "successor_ineligible",
        message: `${displayName(chosen)} cannot take over — they are either inactive, the outgoing manager, or a property manager.`,
      });
    } else {
      successor = chosen;
    }
  } else if (needsSuccessor) {
    if (candidates.length === 0) {
      // The state `add-property.post.ts` can leave behind: an org whose only
      // admin is the agency. There is no safe way through — the community has
      // nobody to hand itself to.
      blockers.push({
        code: "no_eligible_successor",
        message:
          "This community has no active member who can take over as administrator. Invite a board member and give them an account before starting the transition.",
      });
    } else {
      blockers.push({
        code: "successor_required",
        message:
          "Choose who takes over as administrator. Once the manager's access is revoked, only that person can run the account.",
      });
    }
  }

  if (successor) {
    if (!successor.isBoardMember) {
      warnings.push({
        code: "successor_not_on_board",
        message: `${displayName(successor)} is not recorded as a board member. That is allowed, but a board seat is the usual home for this.`,
      });
    }
    // ALWAYS first. See the header: promoting after revoking leaves a window
    // with no administrator, and a failure mid-way makes that window permanent.
    steps.push({
      kind: "promote_admin",
      label: `Make ${displayName(successor)} an administrator`,
      detail:
        "Happens before anything is taken away, so the community is never without someone who can run the account — or export its data.",
      targetIds: [successor.id],
    });
  }

  // ── Take back what the outgoing manager holds ────────────────────────────
  const withGrants = outgoing.filter((m) => m.hasGrants);
  if (withGrants.length > 0) {
    steps.push({
      kind: "revoke_grants",
      label: subjectLabel(
        withGrants,
        (m) => `Revoke ${displayName(m)}'s manager permissions`,
        (n) => `Revoke manager permissions from ${n} people`
      ),
      detail: `All ${MANAGER_GRANT_KEYS.length} permissions are cleared — inquiries, violations, directory, documents, communications, projects and activity.`,
      targetIds: withGrants.map((m) => m.id),
    });
  }

  if (outgoing.length > 0) {
    steps.push({
      kind: "deactivate_member",
      label: subjectLabel(
        outgoing,
        (m) => `End ${displayName(m)}'s access`,
        (n) => `End access for ${n} people`
      ),
      detail:
        "Their membership is marked inactive. Nothing is deleted — everything they did stays in the community's record, which is what makes the history yours.",
      targetIds: outgoing.map((m) => m.id),
    });
  }

  // ── The vendor row: the community's own record of who managed it, when ───
  const vendorsToEnd = input.managementVendors.filter((v) => !v.activeUntil);
  const alreadyEnded = input.managementVendors.filter((v) => v.activeUntil);

  if (input.managementVendors.length === 0) {
    warnings.push({
      code: "no_management_vendor",
      message:
        "No management company is recorded in this community's vendor list, so there is no relationship to end-date. The rest of the transition still applies.",
    });
  } else if (vendorsToEnd.length === 0) {
    warnings.push({
      code: "vendor_already_ended",
      message: `${alreadyEnded.length === 1 ? "The management company's record is" : "The management companies' records are"} already end-dated.`,
    });
  } else {
    steps.push({
      kind: "end_vendor",
      label: subjectLabel(
        vendorsToEnd,
        (v) => `End-date ${v.company || "the management company"}`,
        (n) => `End-date ${n} management records`
      ),
      detail:
        "Records the day the relationship ended and marks it inactive. The vendor stays in your history — a community should be able to say who managed it, and when, years later.",
      targetIds: vendorsToEnd.map((v) => v.id),
    });
  }

  // ── Billing: a grace window, not a cliff ────────────────────────────────
  let graceEndsAt: string | null = null;

  if (org.graceEndsAt) {
    warnings.push({
      code: "transition_in_flight",
      message: `A transition is already under way for this community; its grace period ends ${org.graceEndsAt.slice(0, 10)}. Running another will restart the clock.`,
    });
  }

  if (org.billingAccountId) {
    steps.push({
      kind: "detach_billing",
      label: "Detach from the management company's billing account",
      detail:
        "The community stops being billed through the agency and becomes responsible for its own subscription.",
      targetIds: [org.id],
    });

    if (org.isFreeAccount) {
      warnings.push({
        code: "free_account_no_grace",
        message:
          "This community is on a free account, so it keeps working regardless — no grace period is needed.",
      });
    } else {
      graceEndsAt = addDays(now, graceDays);
      steps.push({
        kind: "open_grace",
        label: `Keep the community running for ${graceDays} days`,
        detail:
          "Instead of being locked out the moment the manager leaves, the board keeps full access until the grace period ends — long enough to choose a new manager or take over billing themselves.",
        targetIds: [org.id],
      });
    }
  } else {
    warnings.push({
      code: "self_billed_no_detach",
      message:
        "This community pays for itself, so nothing about its billing changes — only the manager's access does.",
    });
  }

  // ── The way out, and the record ─────────────────────────────────────────
  if (input.includeExportForOutgoing && outgoing.length > 0) {
    steps.push({
      kind: "offer_export",
      label: "Prepare a shareable export for the outgoing manager",
      detail:
        "The operational record without your board's private discussion — the same export you would hand an incoming manager. Their work should leave with them; your community's history stays.",
      targetIds: outgoing.map((m) => m.id),
    });
  }

  // A transition that changes nothing should not be dressed up as an event.
  const substantive = steps.length > 0;
  if (!substantive && blockers.length === 0) {
    blockers.push({
      code: "nothing_to_do",
      message:
        "There is nothing to transition — no manager holds access to this community, and its administrator is already a member of the community.",
    });
  }

  if (substantive) {
    steps.push({
      kind: "write_audit",
      label: "Record what happened",
      detail:
        "One permanent entry in the community's audit log: who did this, when, and every change above. It cannot be edited or deleted, by anyone.",
      targetIds: [org.id],
    });
  }

  return {
    schemaVersion: TRANSITION_SCHEMA_VERSION,
    blockers,
    warnings,
    steps,
    successor,
    outgoing,
    graceEndsAt,
    canExecute: blockers.length === 0,
  };
}

/**
 * The grants written when a manager is onboarded with a preset, expressed as the
 * full key set so a stored row never carries a missing (and therefore
 * ambiguous) flag.
 */
export function grantsForOnboarding(preset: ManagerGrants): ManagerGrants {
  return Object.fromEntries(
    MANAGER_GRANT_KEYS.map((k) => [k, preset[k] === true])
  ) as ManagerGrants;
}
