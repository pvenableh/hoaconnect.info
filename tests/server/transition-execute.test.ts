/**
 * The executor writes in the plan's order, and stops cleanly when a write fails.
 *
 * `transition-plan.test.ts` pins the ORDER of the plan; this pins that the
 * executor honours it against Directus, because the ordering is only a safety
 * property if the code that runs it preserves it. The claim being defended:
 *
 *   every prefix of promote → revoke → deactivate → end-date → detach → grace
 *   → export → audit is a safe state, so a failure halfway can stop where it is
 *   rather than roll back (rolling back means re-granting a manager the access
 *   an admin just asked to remove).
 *
 * The Directus SDK is mocked down to plain description objects so each write is
 * inspectable — what collection, which row, what payload.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  updateItem: (collection: string, id: string, payload: unknown) => ({
    op: "update",
    collection,
    id,
    payload,
  }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
}));

import { executeTransitionPlan } from "#core/server/utils/transition-execute";
import { planTransition, type TransitionInput } from "#core/shared/transition/plan";
import { MANAGER_GRANT_KEYS } from "#core/shared/transition/grants";

const NOW = "2026-08-19T12:00:00.000Z";

type Write = { op: string; collection: string; id?: string; payload?: any; query?: any };

let writes: Write[];
let failOn: ((w: Write) => boolean) | null;
let seatSyncs: string[];
let auditEntries: any[];

function input(): TransitionInput {
  return {
    organization: {
      id: "org-1",
      name: "Harborview Lofts",
      slug: "harborview",
      billingAccountId: "acct-1",
      subscriptionStatus: "active",
      isFreeAccount: false,
      graceEndsAt: null,
    },
    members: [
      {
        id: "pm",
        name: "Dana Reyes",
        email: "dana@acme.example",
        userId: "user-pm",
        roleKind: "property_manager",
        status: "active",
        isBoardMember: false,
        boardTitle: null,
        hasGrants: true,
      },
      {
        id: "pres",
        name: "Jo Alvarez",
        email: "jo@example.com",
        userId: "user-pres",
        roleKind: "member",
        status: "active",
        isBoardMember: true,
        boardTitle: "president",
        hasGrants: false,
      },
    ],
    managementVendors: [
      {
        id: "vendor-1",
        company: "Acme Management",
        status: "active",
        activeUntil: null,
        userId: "user-pm",
        memberId: "pm",
      },
    ],
    successorMemberId: "pres",
    includeExportForOutgoing: true,
    now: NOW,
  };
}

function run(over: Partial<Parameters<typeof executeTransitionPlan>[0]> = {}) {
  const plan = planTransition(input());
  return executeTransitionPlan({
    plan,
    organizationId: "org-1",
    organizationName: "Harborview Lofts",
    hoaAdminRoleId: "role-hoa-admin",
    billingAccountId: "acct-1",
    actor: { userId: "user-pres", name: "Jo Alvarez", email: "jo@example.com" },
    now: NOW,
    ...over,
  });
}

beforeEach(() => {
  writes = [];
  failOn = null;
  seatSyncs = [];
  auditEntries = [];

  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (command: Write) => {
      if (failOn?.(command)) throw new Error("Directus said no");
      writes.push(command);
      // The in-flight export check reads; nothing is in flight by default.
      if (command.op === "read") return [];
      return { id: `${command.collection}-new` };
    },
  }));
  vi.stubGlobal("syncBillingAccountSeats", async (accountId: string) => {
    seatSyncs.push(accountId);
    return { seats: 4 };
  });
  vi.stubGlobal("writeAuditEntry", async (entry: any) => {
    auditEntries.push(entry);
    return "audit-1";
  });
});

const mutations = () => writes.filter((w) => w.op !== "read");

describe("the executor follows the plan's order", () => {
  it("promotes the successor before touching the outgoing manager", async () => {
    await run();
    const seq = mutations();

    const promote = seq.findIndex(
      (w) => w.collection === "hoa_members" && w.payload?.role === "role-hoa-admin"
    );
    const revoke = seq.findIndex((w) => w.payload?.manager_permissions);
    const deactivate = seq.findIndex((w) => w.payload?.status === "inactive" && w.collection === "hoa_members");

    expect(promote).toBeGreaterThanOrEqual(0);
    expect(promote).toBeLessThan(revoke);
    expect(promote).toBeLessThan(deactivate);
  });

  it("writes the whole plan and reports every step done", async () => {
    const result = await run();
    expect(result.completed).toBe(true);
    expect(result.steps.every((s) => s.status === "done")).toBe(true);
    expect(result.auditEntryId).toBe("audit-1");
  });

  it("revokes by writing every flag false, never by nulling the field", async () => {
    await run();
    const revoke = mutations().find((w) => w.payload?.manager_permissions);
    const grants = revoke?.payload.manager_permissions;
    expect(Object.keys(grants).sort()).toEqual([...MANAGER_GRANT_KEYS].sort());
    expect(Object.values(grants).every((v) => v === false)).toBe(true);
  });

  it("deactivates the outgoing membership and deletes nothing", async () => {
    await run();
    expect(mutations().some((w) => w.op === "delete")).toBe(false);
    const deactivate = mutations().find(
      (w) => w.collection === "hoa_members" && w.id === "pm" && w.payload?.status === "inactive"
    );
    expect(deactivate).toBeTruthy();
  });

  it("end-dates the management vendor with a date, not a timestamp", async () => {
    await run();
    const vendor = mutations().find((w) => w.collection === "hoa_vendors");
    expect(vendor?.payload.active_until).toBe("2026-08-19");
    expect(vendor?.payload.status).toBe("inactive");
  });

  it("detaches billing, syncs the agency's seats, then opens the grace window", async () => {
    const result = await run();
    const orgWrites = mutations().filter((w) => w.collection === "hoa_organizations");

    expect(orgWrites[0]?.payload.billing_account).toBeNull();
    expect(orgWrites[1]?.payload.grace_ends_at).toBe(result.graceEndsAt);
    // Dropping this would leave the agency paying for a property it no longer bills.
    expect(seatSyncs).toEqual(["acct-1"]);
  });

  it("queues the outgoing manager's export as shareable, without files", async () => {
    const result = await run();
    const exportWrite = mutations().find((w) => w.collection === "hoa_data_exports");
    expect(exportWrite?.payload.tier).toBe("shareable");
    expect(exportWrite?.payload.include_files).toBe(false);
    expect(result.exportId).toBe("hoa_data_exports-new");
  });

  it("records the audit entry last, naming who left and who took over", async () => {
    await run();
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].summary).toContain("Dana Reyes");
    expect(auditEntries[0].summary).toContain("Jo Alvarez");
    expect(auditEntries[0].event_type).toBe("management_transition");
  });
});

describe("when a write fails", () => {
  it("stops at the failure and reports the prefix that landed", async () => {
    // Fail the vendor end-date: promote, revoke and deactivate have run.
    failOn = (w) => w.collection === "hoa_vendors";
    const result = await run();

    expect(result.completed).toBe(false);
    const failed = result.steps.find((s) => s.status === "failed");
    expect(failed?.kind).toBe("end_vendor");
    expect(failed?.note).toContain("Directus said no");

    // Everything before it is reported done, and nothing after it ran.
    const kinds = result.steps.map((s) => s.kind);
    expect(kinds).toEqual(["promote_admin", "revoke_grants", "deactivate_member", "end_vendor"]);
    expect(mutations().some((w) => w.collection === "hoa_organizations")).toBe(false);
  });

  it("never writes the audit entry for a transition that did not finish", async () => {
    // An entry describing work that did not happen is worse than no entry.
    failOn = (w) => w.collection === "hoa_organizations";
    const result = await run();
    expect(result.completed).toBe(false);
    expect(auditEntries).toEqual([]);
    expect(result.auditEntryId).toBeNull();
  });

  it("leaves an administrator in place even when it fails immediately after promoting", async () => {
    // The safety property: the earliest possible failure still leaves the
    // community with someone who can run the account.
    failOn = (w) => Boolean(w.payload?.manager_permissions);
    const result = await run();

    expect(result.completed).toBe(false);
    const promoted = mutations().find((w) => w.payload?.role === "role-hoa-admin");
    expect(promoted?.id).toBe("pres");
  });
});

describe("a plan with blockers is refused outright", () => {
  it("throws rather than executing a partial transition", async () => {
    const blocked = planTransition({ ...input(), successorMemberId: null });
    expect(blocked.canExecute).toBe(false);

    await expect(
      executeTransitionPlan({
        plan: blocked,
        organizationId: "org-1",
        organizationName: "Harborview Lofts",
        hoaAdminRoleId: "role-hoa-admin",
        billingAccountId: "acct-1",
        actor: { userId: "u", name: "Jo", email: null },
        now: NOW,
      })
    ).rejects.toThrow();

    expect(writes).toEqual([]);
  });
});

describe("an export already in flight", () => {
  it("is not duplicated", async () => {
    vi.stubGlobal("getTypedDirectus", () => ({
      request: async (command: Write) => {
        writes.push(command);
        if (command.op === "read") return [{ id: "existing-export" }];
        return { id: `${command.collection}-new` };
      },
    }));

    const result = await run();
    expect(result.exportId).toBeNull();
    const step = result.steps.find((s) => s.kind === "offer_export");
    expect(step?.status).toBe("skipped");
    expect(mutations().some((w) => w.collection === "hoa_data_exports")).toBe(false);
  });
});
