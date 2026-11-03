/**
 * Suppression from the SendGrid webhook (Phase 3a). What these pin:
 *
 *   · a hard bounce marks the org's member with that address bounced; a spam
 *     report or unsubscribe opts them out of community mail — matched
 *     case-insensitively, exactly, and only inside the event's org;
 *   · suppression runs BEFORE any activity row is written, and a failed store
 *     answers 503 with nothing written — so SendGrid's redelivery can't
 *     duplicate a row;
 *   · before the fields exist the batch is stored as before (no 503 loop);
 *   · an event with no org is never applied to anyone.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  createItem: (collection: string, data: any) => ({ op: "createItem", collection, data }),
  updateItem: (collection: string, id: string, data: any) => ({ op: "updateItem", collection, id, data }),
  updateItemsBatch: (collection: string, data: any[]) => ({ op: "updateItemsBatch", collection, data }),
  readFieldsByCollection: (collection: string) => ({ op: "readFields", collection }),
}));

const ORG = "org-a";
const FIELDS = [
  "email_community_opt_out",
  "email_community_opt_out_at",
  "email_community_opt_out_source",
  "email_bounced",
  "email_bounced_at",
  "email_bounced_reason",
  "unsubscribe_token",
];

type Op = { op: string; collection: string; id?: string; data?: any; query?: any };
let ops: Op[];
let raw: string;
let provisioned: boolean;
let failSuppressionWrite: boolean;
let orgMembers: any[];

beforeEach(async () => {
  ops = [];
  provisioned = true;
  failSuppressionWrite = false;
  orgMembers = [
    { id: "m-pat", email: "Pat@Example.com", email_bounced: false, email_community_opt_out: false },
    { id: "m-apat", email: "apat@example.com", email_bounced: false, email_community_opt_out: false },
  ];
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("readRawBody", async () => raw);
  vi.stubGlobal("getHeader", () => null);
  vi.stubGlobal("useRuntimeConfig", () => ({}));
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: Op) => {
      ops.push(op);
      if (op.op === "readFields") {
        return (op.collection === "hoa_members" && provisioned ? ["id", ...FIELDS] : ["id", "email_class"]).map((field) => ({ field }));
      }
      if (op.op === "readItems" && op.collection === "hoa_members") {
        // The suppression read (`_icontains`), scoped to the event's org.
        if (op.query.filter.email?._icontains) {
          return op.query.filter.organization._eq === ORG ? orgMembers : [];
        }
        return [];
      }
      if (op.op === "updateItem" && op.collection === "hoa_members" && failSuppressionWrite) throw new Error("down");
      if (op.op === "readItems") return [];
      return { id: "row" };
    },
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();
});

const handler = async () => (await import("#core/server/api/email/activity.post")).default as any;
const memberWrites = () => ops.filter((o) => o.op === "updateItem" && o.collection === "hoa_members");
const activityRows = () => ops.filter((o) => o.op === "createItem" && o.collection === "hoa_email_activity");

const ev = (over: Record<string, unknown>) => ({
  email: "pat@example.com",
  timestamp: 1730000000,
  category: ["HOA Connect", `org:${ORG}`],
  organization_id: ORG,
  ...over,
});

describe("POST /api/email/activity — suppression", () => {
  it("marks a hard bounce on the org's member with that address (exact, case-insensitive)", async () => {
    raw = JSON.stringify([ev({ event: "bounce", type: "bounce", bounce_classification: "Invalid Address", reason: "550 no such user" })]);
    await (await handler())({});
    expect(memberWrites()).toHaveLength(1);
    expect(memberWrites()[0]).toMatchObject({
      id: "m-pat",
      data: { email_bounced: true, email_bounced_reason: "Invalid Address: 550 no such user" },
    });
    const read = ops.find((o) => o.op === "readItems" && o.query?.filter?.email?._icontains)!;
    expect(read.query.filter.organization).toEqual({ _eq: ORG });
  });

  it("opts out on a spam report (source spam) and an unsubscribe (source link)", async () => {
    raw = JSON.stringify([ev({ event: "spamreport" })]);
    await (await handler())({});
    expect(memberWrites()[0]!.data).toMatchObject({ email_community_opt_out: true, email_community_opt_out_source: "spam" });

    ops = [];
    raw = JSON.stringify([ev({ event: "unsubscribe" })]);
    await (await handler())({});
    expect(memberWrites()[0]!.data).toMatchObject({ email_community_opt_out_source: "link" });
  });

  it("does nothing to members for a reputation bounce or a delivery", async () => {
    raw = JSON.stringify([
      ev({ event: "bounce", type: "bounce", bounce_classification: "Reputation" }),
      ev({ event: "bounce", type: "blocked" }),
      ev({ event: "delivered" }),
    ]);
    await (await handler())({});
    expect(memberWrites()).toHaveLength(0);
    expect(activityRows()).toHaveLength(3);
  });

  it("runs before any activity row is written", async () => {
    raw = JSON.stringify([ev({ event: "delivered" }), ev({ event: "spamreport" })]);
    await (await handler())({});
    const firstWrite = ops.findIndex((o) => o.op === "updateItem" && o.collection === "hoa_members");
    const firstActivity = ops.findIndex((o) => o.op === "createItem" && o.collection === "hoa_email_activity");
    expect(firstWrite).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeLessThan(firstActivity);
  });

  it("503s on a failed store, with no activity row written", async () => {
    failSuppressionWrite = true;
    raw = JSON.stringify([ev({ event: "delivered" }), ev({ event: "bounce", type: "bounce" })]);
    await expect((await handler())({})).rejects.toMatchObject({ statusCode: 503 });
    expect(activityRows()).toHaveLength(0);
  });

  it("before the fields exist: no suppression, no 503, the batch is stored as before", async () => {
    provisioned = false;
    raw = JSON.stringify([ev({ event: "spamreport" })]);
    const res = await (await handler())({});
    expect(res.success).toBe(true);
    expect(memberWrites()).toHaveLength(0);
    expect(activityRows()).toHaveLength(1);
  });

  it("never applies an event that names no org", async () => {
    raw = JSON.stringify([{ email: "pat@example.com", event: "spamreport", timestamp: 1, category: ["HOA Connect"] }]);
    await (await handler())({});
    expect(memberWrites()).toHaveLength(0);
    expect(ops.some((o) => o.op === "readFields")).toBe(false);
  });

  it("is idempotent across a redelivery: an already-bounced member is not rewritten", async () => {
    orgMembers = [{ id: "m-pat", email: "pat@example.com", email_bounced: true, email_community_opt_out: false }];
    raw = JSON.stringify([ev({ event: "bounce", type: "bounce" })]);
    await (await handler())({});
    expect(memberWrites()).toHaveLength(0);
  });
});
