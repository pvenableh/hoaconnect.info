import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verifySendgridEventWebhook } from "#core/server/utils/sendgrid-webhook";

// Generate a real P-256 keypair and sign like SendGrid does, so the test
// exercises the actual ECDSA/SHA-256 verification path (not a mock).
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKeyB64 = (publicKey.export({ format: "der", type: "spki" }) as Buffer).toString("base64");

function sign(timestamp: string, payload: string): string {
  const signer = createSign("sha256");
  signer.update(timestamp + payload);
  signer.end();
  return signer.sign(privateKey).toString("base64");
}

const timestamp = "1718900000";
const payload = JSON.stringify([{ email: "a@b.com", event: "delivered" }]);

describe("verifySendgridEventWebhook", () => {
  it("accepts a correctly signed payload", () => {
    const signature = sign(timestamp, payload);
    expect(
      verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature, timestamp })
    ).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const signature = sign(timestamp, payload);
    expect(
      verifySendgridEventWebhook({
        publicKey: publicKeyB64,
        payload: payload + " ",
        signature,
        timestamp,
      })
    ).toBe(false);
  });

  it("rejects a mismatched timestamp (replay binding)", () => {
    const signature = sign(timestamp, payload);
    expect(
      verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature, timestamp: "1718900001" })
    ).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const signer = createSign("sha256");
    signer.update(timestamp + payload);
    signer.end();
    const foreignSignature = signer.sign(other.privateKey).toString("base64");
    expect(
      verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature: foreignSignature, timestamp })
    ).toBe(false);
  });

  it("returns false on missing inputs or a garbage key", () => {
    expect(verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature: null, timestamp })).toBe(false);
    expect(verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature: "x", timestamp: null })).toBe(false);
    expect(verifySendgridEventWebhook({ publicKey: "not-a-key", payload, signature: "x", timestamp })).toBe(false);
  });
});

// ── The send queue's half of the webhook (docs/spec-email-send-queue.md §4.3; §10 group G) ──

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
const hq = vi.hoisted(() => ({ store: null as any }));
vi.mock("#core/server/utils/email-send-queue", async (orig) => {
  const mod = await orig<typeof import("#core/server/utils/email-send-queue")>();
  return { ...mod, directusRecipientStore: () => hq.store, emailQueueSchema: async () => true };
});

describe("POST /api/email/activity — the send queue's rows (G)", () => {
  type Mem = import("./support/email-queue-memory").MemoryStore;
  let store: Mem;
  let raw: string;
  let ops: any[];
  const ORG = "org-a";

  beforeAll(async () => {
    vi.stubGlobal("defineEventHandler", (fn: any) => fn);
    await import("#core/server/api/email/activity.post");
  }, 120_000);

  beforeEach(async () => {
    const { MemoryStore, QUEUE_FIELDS_PROVISIONED } = await import("./support/email-queue-memory");
    store = new MemoryStore();
    hq.store = store;
    ops = [];
    vi.stubGlobal("readRawBody", async () => raw);
    vi.stubGlobal("getHeader", () => null);
    vi.stubGlobal("useRuntimeConfig", () => ({}));
    vi.stubGlobal("getTypedDirectus", () => ({
      request: async (op: any) => {
        ops.push(op);
        if (op.op === "readFields") return (QUEUE_FIELDS_PROVISIONED[op.collection] ?? ["id"]).map((field: string) => ({ field }));
        if (op.op === "readItems" && op.collection === "hoa_email_recipients") {
          const f = op.query.filter;
          return [...store.rows.values()]
            .filter((r) =>
              f.id ? r.id === f.id._eq && (!f.email || r.email === f.email._eq)
              : f.sg_message_id ? r.sg_message_id === f.sg_message_id._eq
              : r.email === f.email._eq && r.recipient_email === f.recipient_email._eq
            )
            .slice(0, op.query.limit ?? 100)
            .map((r) => ({ ...r }));
        }
        if (op.op === "updateItem" && op.collection === "hoa_email_recipients") {
          Object.assign(store.rows.get(op.id)!, op.data);
          return {};
        }
        if (op.op === "readItems") return [];
        return { id: "x" };
      },
    }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();

    // A household: two members share one address on one send.
    const { seedSending } = await import("./support/email-queue-memory");
    await seedSending(store, 2, { emailId: "e1" });
    const [a, b] = store.rowsOf("e1");
    Object.assign(a!, { recipient_email: "home@example.com", status: "sent", sg_message_id: "msgA", sent_at: "2026-11-03T12:00:00.000Z" });
    Object.assign(b!, { recipient_email: "home@example.com", status: "unknown", error_message: "Its run stopped" });
  });

  const handler = async () => (await import("#core/server/api/email/activity.post")).default as any;
  const ev = (over: Record<string, unknown>) => ({
    email: "home@example.com",
    timestamp: 1_793_000_000,
    category: ["HOA Connect", `org:${ORG}`],
    organization_id: ORG,
    email_id: "e1",
    ...over,
  });
  const rowWrites = () => ops.filter((o) => o.op === "updateItem" && o.collection === "hoa_email_recipients");

  it("54. looks the row up by recipient_id first, then by email_id + address, then by message id", async () => {
    const [a, b] = store.rowsOf("e1");
    raw = JSON.stringify([ev({ event: "processed", recipient_id: b!.id, sg_message_id: "msgB.filter1" })]);
    await (await handler())({});
    // The address alone would have picked row A; recipient_id picks B.
    expect(rowWrites().map((w) => w.id)).toEqual([b!.id]);
    const activity = ops.find((o) => o.op === "createItem" && o.collection === "hoa_email_activity");
    expect(activity.data.email_recipient).toBe(b!.id);

    ops.length = 0;
    raw = JSON.stringify([ev({ event: "open" })]); // pre-3b mail: no recipient_id
    await (await handler())({});
    expect(ops.find((o) => o.op === "createItem").data.email_recipient).toBe(a!.id);

    ops.length = 0;
    raw = JSON.stringify([ev({ event: "open", email_id: undefined, sg_message_id: "msgA.filter0" })]);
    await (await handler())({});
    expect(ops.find((o) => o.op === "createItem").data.email_recipient).toBe(a!.id);
  });

  it("55. promotes claimed and unknown rows to sent on any event; a sent row is left alone", async () => {
    const [a, b] = store.rowsOf("e1");
    Object.assign(store.email("e1"), { status: "sent", total_sent: 1, total_unknown: 1 });
    raw = JSON.stringify([
      ev({ event: "open", recipient_id: b!.id, sg_message_id: "<msgB>.filter3" }),
      ev({ event: "open", recipient_id: a!.id, sg_message_id: "msgA.filter3" }),
    ]);
    await (await handler())({});
    expect(store.rows.get(b!.id)).toMatchObject({
      status: "sent",
      sent_at: new Date(1_793_000_000 * 1000).toISOString(),
      sg_message_id: "msgB",
      error_message: null,
    });
    expect(rowWrites().map((w) => w.id)).toEqual([b!.id]);
    expect(store.rows.get(a!.id)).toMatchObject({ status: "sent", sg_message_id: "msgA", sent_at: "2026-11-03T12:00:00.000Z" });
    // …and the totals follow the rows.
    expect(store.email("e1")).toMatchObject({ total_sent: 2, total_unknown: 0, delivered_count: 2 });

    const claimed = store.rowsOf("e1")[0]!;
    Object.assign(claimed, { status: "claimed" });
    raw = JSON.stringify([ev({ event: "deferred", recipient_id: claimed.id })]);
    await (await handler())({});
    expect(store.rows.get(claimed.id)!.status).toBe("sent");
  });

  it("56. writes delivery_status, never status, for delivered, bounce and dropped", async () => {
    const [a] = store.rowsOf("e1");
    for (const [event, expected] of [["delivered", "delivered"], ["bounce", "bounced"], ["dropped", "bounced"]] as const) {
      ops.length = 0;
      Object.assign(store.rows.get(a!.id)!, { delivery_status: null });
      raw = JSON.stringify([ev({ event, recipient_id: a!.id, type: "blocked" })]);
      await (await handler())({});
      expect(rowWrites()).toHaveLength(1);
      expect(rowWrites()[0].data).toEqual({ delivery_status: expected });
      expect(store.rows.get(a!.id)!.status).toBe("sent");
    }
  });
});
