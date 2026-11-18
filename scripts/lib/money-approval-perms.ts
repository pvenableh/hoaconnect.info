/**
 * The money write lock (docs/spec-money-approvals.md, "Permissions"): what
 * `pnpm add:money-approvals --lock` removes, as a pure plan so a test can
 * hold it.
 *
 *   payment_expenses           no policy writes it: the HOA Admin policy
 *                              loses create, update and delete, and so would
 *                              any other policy that had them. Read stays on
 *                              the HOA Admin policy; every app read and write
 *                              is a route on the app's token
 *   money_approvals,           no policy keeps ANY rule, read included: reads
 *   money_approval_decisions   go through the routes, which apply the rule and
 *                              the community filter
 *   payment_requests           the charge cancel lock (Session 5): no policy
 *                              updates or deletes a charge. Cancelling one gives
 *                              up income, so it is a waiver, approved like
 *                              spending (POST /api/org/money/charges/[id]/waive);
 *                              deleting one gave up the same income with no
 *                              record at all. A validation refusing status
 *                              "canceled" was the other mechanism, and is not
 *                              enough: it leaves delete, and the app writes no
 *                              charge through Directus any more (recording a
 *                              payment, reminders and waivers are routes on the
 *                              app's token). Create and read stay: the New
 *                              charge form creates through Directus
 *
 * Directus's own administrators (platform staff, admin_access) are outside
 * this: they have no permission rows to remove.
 */

export const APPROVAL_COLLECTIONS = ["money_approvals", "money_approval_decisions"] as const;
export const EXPENSE_WRITES = ["create", "update", "delete"] as const;
/** What no policy may do to a charge (`payment_requests`): cancel it, or delete it. */
export const CHARGE_WRITES = ["update", "delete"] as const;
export const LOCKED_COLLECTIONS = ["payment_expenses", "payment_requests", ...APPROVAL_COLLECTIONS] as const;

export interface PermissionRow {
  id: number | string;
  policyName: string | null;
  collection: string;
  action: string;
}

/** The rows the lock removes, in the order given. */
export function lockPlan(rows: readonly PermissionRow[]): PermissionRow[] {
  return rows.filter(
    (r) =>
      (APPROVAL_COLLECTIONS as readonly string[]).includes(r.collection) ||
      (r.collection === "payment_expenses" && (EXPENSE_WRITES as readonly string[]).includes(r.action)) ||
      (r.collection === "payment_requests" && (CHARGE_WRITES as readonly string[]).includes(r.action))
  );
}
