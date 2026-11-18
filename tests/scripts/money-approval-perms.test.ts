/**
 * The money write lock (docs/spec-money-approvals.md, "Permissions"): after
 * `pnpm add:money-approvals --lock`, no policy writes payment_expenses and
 * no policy has any rule on money_approvals or money_approval_decisions.
 * A re-run of the permission scripts keeps it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lockPlan, type PermissionRow } from "../../scripts/lib/money-approval-perms";
import { isRemovedAdminRule } from "../../scripts/lib/admin-scope-perms";

const row = (id: number, policyName: string | null, collection: string, action: string): PermissionRow => ({ id, policyName, collection, action });

describe("the lock plan", () => {
  const live = [
    row(1, "HOA Admin", "payment_expenses", "read"),
    row(2, "HOA Admin", "payment_expenses", "delete"),
    row(3, "HOA Admin", "payment_expenses", "create"),
    row(4, "HOA Admin", "payment_expenses", "update"),
    row(5, "Property Manager", "payment_expenses", "update"),
    row(6, "HOA Admin", "money_approvals", "read"),
    row(7, "HOA Member", "money_approval_decisions", "create"),
    row(8, "HOA Admin", "payment_requests", "update"),
  ];

  it("removes every write on payment_expenses and every rule on the approvals", () => {
    expect(lockPlan(live).map((r) => r.id)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("keeps the HOA Admin read on payment_expenses, and leaves other collections to Session 5", () => {
    const kept = live.filter((r) => !lockPlan(live).includes(r)).map((r) => r.id);
    expect(kept).toEqual([1, 8]);
  });

  it("leaves nothing to remove once applied", () => {
    const after = live.filter((r) => !lockPlan(live).includes(r));
    expect(lockPlan(after)).toEqual([]);
  });
});

describe("a re-run keeps the lock", () => {
  it("setup-directus-permissions removes and never recreates the HOA Admin's expense writes", () => {
    for (const action of ["create", "update", "delete"]) expect(isRemovedAdminRule("payment_expenses", action), action).toBe(true);
    expect(isRemovedAdminRule("payment_expenses", "read")).toBe(false);
  });

  it("create-expenses-collection grants only what REMOVED_ADMIN_RULES leaves, and no policy script names the approvals", () => {
    const expenses = readFileSync(join(process.cwd(), "scripts/create-expenses-collection.ts"), "utf8");
    expect(expenses).toContain('.filter((a) => !isRemovedAdminRule("payment_expenses", a))');
    for (const f of ["scripts/setup-directus-permissions.ts", "scripts/create-expenses-collection.ts", "scripts/lib/admin-scope-perms.ts"]) {
      expect(readFileSync(join(process.cwd(), f), "utf8"), f).not.toMatch(/money_approval/);
    }
  });
});
