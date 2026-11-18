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
 *
 * Directus's own administrators (platform staff, admin_access) are outside
 * this: they have no permission rows to remove.
 */

export const APPROVAL_COLLECTIONS = ["money_approvals", "money_approval_decisions"] as const;
export const EXPENSE_WRITES = ["create", "update", "delete"] as const;

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
      (r.collection === "payment_expenses" && (EXPENSE_WRITES as readonly string[]).includes(r.action))
  );
}
