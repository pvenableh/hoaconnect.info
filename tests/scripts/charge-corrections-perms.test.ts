/**
 * Correcting a charge changes no permission (docs/spec-charge-corrections.md):
 * `pnpm add:charge-corrections` fails while any policy can update or delete a
 * charge, and the schema script itself writes no permission.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chargeWriteRules, type PermissionRow } from "../../scripts/lib/money-approval-perms";

const row = (id: number, policyName: string | null, collection: string, action: string): PermissionRow => ({ id, policyName, collection, action });

describe("the charge write check", () => {
  it("finds every policy's update and delete on payment_requests, and nothing else", () => {
    const rows = [
      row(182, "HOA Admin", "payment_requests", "create"),
      row(183, "HOA Admin", "payment_requests", "read"),
      row(211, "HOA Member", "payment_requests", "read"),
      row(300, "Property Manager", "payment_requests", "update"),
      row(301, "HOA Admin", "payment_requests", "delete"),
      row(302, "HOA Admin", "payment_expenses", "update"),
    ];
    expect(chargeWriteRules(rows).map((r) => r.id)).toEqual([300, 301]);
  });

  it("the live shape after the Session 5 lock passes", () => {
    const live = [row(182, "HOA Admin", "payment_requests", "create"), row(183, "HOA Admin", "payment_requests", "read"), row(211, "HOA Member", "payment_requests", "read")];
    expect(chargeWriteRules(live)).toEqual([]);
  });

  it("the schema script reads permissions but never writes one", () => {
    const src = readFileSync(join(process.cwd(), "scripts/add-charge-corrections.ts"), "utf8");
    expect(src).toMatch(/\/permissions\?filter=/);
    expect(src).not.toMatch(/\/permissions\/\$\{/);
    expect(src).not.toMatch(/\/permissions",\s*\{\s*method/);
  });
});
