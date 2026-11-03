/**
 * The Directus store (docs/spec-email-send-queue.md §10, group B): the exact
 * SDK requests the queue makes, so the conditions the design leans on (the
 * claim's `status = queued`, the release's token, the settle's `status =
 * claimed`) can't be dropped without a test noticing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
  createItem: (collection: string, data: any, query?: any) => ({ op: "createItem", collection, data, query }),
  createItems: (collection: string, data: any[], query?: any) => ({ op: "createItems", collection, data, query }),
  updateItem: (collection: string, id: string, data: any, query?: any) => ({ op: "updateItem", collection, id, data, query }),
  updateItems: (collection: string, keysOrQuery: any, data: any, query?: any) => ({ op: "updateItems", collection, keysOrQuery, data, query }),
  updateItemsBatch: (collection: string, data: any[]) => ({ op: "updateItemsBatch", collection, data }),
  deleteItems: (collection: string, keysOrQuery: any) => ({ op: "deleteItems", collection, keysOrQuery }),
  aggregate: (collection: string, options: any) => ({ op: "aggregate", collection, options }),
  readFieldsByCollection: (collection: string) => ({ op: "readFields", collection }),
}));

import { directusRecipientStore, emailQueueSchema, _resetEmailQueueSchemaCache, QUEUE_SCHEMA_FIELDS } from "#core/server/utils/email-send-queue";

let requests: any[];
let answer: (req: any) => any;
const directus = { request: async (req: any) => (requests.push(req), answer(req)) };
const store = directusRecipientStore(directus);

beforeEach(() => {
  requests = [];
  answer = () => [];
});

describe("directusRecipientStore (B)", () => {
  it("19. queued() filters on email, run_key and status, sorted position then id", async () => {
    await store.queued("e1", "m:k", 100);
    expect(requests).toEqual([
      expect.objectContaining({
        op: "readItems",
        collection: "hoa_email_recipients",
        query: expect.objectContaining({
          filter: { email: { _eq: "e1" }, run_key: { _eq: "m:k" }, status: { _eq: "queued" } },
          sort: ["position", "id"],
          limit: 100,
        }),
      }),
    ]);
  });

  it("20. claim() is a filter-update on queued ids followed by a read-back by token", async () => {
    answer = (req) => (req.op === "readItems" ? [{ id: "r1", email: { id: "e1" }, member: "m1", position: "1" }] : []);
    const rows = await store.claim("e1", "m:k", ["r1", "r2"], "tok", "2026-11-03T12:00:00.000Z");
    expect(requests[0]).toMatchObject({
      op: "updateItems",
      collection: "hoa_email_recipients",
      keysOrQuery: { filter: { id: { _in: ["r1", "r2"] }, status: { _eq: "queued" } } },
      data: { status: "claimed", claim: "tok", claimed_at: "2026-11-03T12:00:00.000Z" },
    });
    expect(requests[1]).toMatchObject({
      op: "readItems",
      query: {
        filter: { email: { _eq: "e1" }, run_key: { _eq: "m:k" }, claim: { _eq: "tok" }, status: { _eq: "claimed" } },
        sort: ["position", "id"],
      },
    });
    expect(rows[0]).toMatchObject({ id: "r1", email: "e1", member: "m1", position: 1 });
  });

  it("21. release() is conditional on token and claimed (and narrows to ids when given)", async () => {
    await store.release("e1", "m:k", "tok");
    await store.release("e1", "m:k", "tok", ["r9"]);
    expect(requests[0]).toMatchObject({
      op: "updateItems",
      keysOrQuery: { filter: { email: { _eq: "e1" }, run_key: { _eq: "m:k" }, claim: { _eq: "tok" }, status: { _eq: "claimed" } } },
      data: { status: "queued", claim: null, claimed_at: null },
    });
    expect(requests[0].keysOrQuery.filter.id).toBeUndefined();
    expect(requests[1].keysOrQuery.filter.id).toEqual({ _in: ["r9"] });
  });

  it("22. expire() targets claimed rows older than the cutoff of this run_key only", async () => {
    answer = () => [{ id: "a" }, { id: "b" }];
    const n = await store.expire("e1", "m:k", "2026-11-03T11:57:00.000Z", "msg");
    expect(n).toBe(2);
    expect(requests[0]).toMatchObject({
      op: "updateItems",
      keysOrQuery: {
        filter: {
          email: { _eq: "e1" },
          run_key: { _eq: "m:k" },
          status: { _eq: "claimed" },
          claimed_at: { _lt: "2026-11-03T11:57:00.000Z" },
        },
      },
      data: { status: "unknown", error_message: "msg" },
    });
  });

  it("23. counts() is one aggregate grouped by status; missing groups read as 0", async () => {
    answer = () => [
      { status: "sent", count: { id: "7" } },
      { status: "queued", count: { id: 3 } },
    ];
    const c = await store.counts("e1", "m:k");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      op: "aggregate",
      collection: "hoa_email_recipients",
      options: {
        aggregate: { count: "id" },
        groupBy: ["status"],
        query: { filter: { email: { _eq: "e1" }, run_key: { _eq: "m:k" } } },
      },
    });
    expect(c).toEqual({ queued: 3, claimed: 0, sent: 7, failed: 0, suppressed: 0, unknown: 0 });
  });

  it("24. settle() groups failures by reason and sends one update per group", async () => {
    await store.settle({
      sent: [
        { id: "s1", sentAt: "t1", messageId: "m1" },
        { id: "s2", sentAt: "t2", messageId: null },
      ],
      failed: [
        { id: "f1", reason: "400: bad" },
        { id: "f2", reason: "400: bad" },
        { id: "f3", reason: "550: gone" },
      ],
      unknown: [{ id: "u1", reason: "timeout" }],
      suppressed: [{ id: "x1", reason: "opted_out_mid_send" }],
    });
    expect(requests.map((r) => r.op)).toEqual(["updateItemsBatch", "updateItems", "updateItems", "updateItems", "updateItems"]);
    expect(requests[0].data).toEqual([
      { id: "s1", status: "sent", sent_at: "t1", sg_message_id: "m1", error_message: null },
      { id: "s2", status: "sent", sent_at: "t2", sg_message_id: null, error_message: null },
    ]);
    expect(requests[1]).toMatchObject({ keysOrQuery: { filter: { id: { _in: ["f1", "f2"] }, status: { _eq: "claimed" } } }, data: { status: "failed", error_message: "400: bad" } });
    expect(requests[2]).toMatchObject({ keysOrQuery: { filter: { id: { _in: ["f3"] }, status: { _eq: "claimed" } } } });
    expect(requests[3]).toMatchObject({ data: { status: "unknown", error_message: "timeout" } });
    expect(requests[4]).toMatchObject({ data: { status: "suppressed", suppressed_reason: "opted_out_mid_send" } });
  });

  it("the lease is an insert, and its release deletes by id AND token", async () => {
    answer = (req) => (req.op === "createItem" ? { id: "L1", email: "e1" } : []);
    const lease = await store.insertLease({ email: "e1", token: "tok", purpose: "send", worker: "cron", started_at: "t" });
    expect(lease).toMatchObject({ id: "L1", email: "e1", token: "tok" });
    await store.deleteLease(lease);
    expect(requests[0]).toMatchObject({ op: "createItem", collection: "hoa_email_send_leases" });
    expect(requests[1]).toMatchObject({ op: "deleteItems", collection: "hoa_email_send_leases", keysOrQuery: { filter: { id: { _eq: "L1" }, token: { _eq: "tok" } } } });
  });
});

describe("emailQueueSchema", () => {
  beforeEach(() => _resetEmailQueueSchemaCache());

  it("is yes only when every field and the lease collection exist", async () => {
    const all = (c: keyof typeof QUEUE_SCHEMA_FIELDS) => ["id", ...QUEUE_SCHEMA_FIELDS[c]].map((field) => ({ field }));
    answer = (req) => all(req.collection);
    expect(await emailQueueSchema(directus)).toBe(true);

    _resetEmailQueueSchemaCache();
    answer = (req) => {
      if (req.collection === "hoa_email_send_leases") throw Object.assign(new Error("Forbidden"), { response: { status: 403 } });
      return all(req.collection);
    };
    expect(await emailQueueSchema(directus)).toBe(false);
  });

  it("throws when Directus is down (an outage is not a missing field)", async () => {
    answer = () => {
      throw new Error("fetch failed");
    };
    await expect(emailQueueSchema(directus)).rejects.toThrow("fetch failed");
  });
});
