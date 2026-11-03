/**
 * Enqueue (docs/spec-email-send-queue.md §10, group D), through send.post.ts
 * and sendEmailJob: the snapshot, 3a's rules once per send, CC/BCC decided
 * once, and the inline tick. Directus is a fake backed by the in-memory store.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { MERGE_FIELDS } from "#core/server/utils/email-merge";
import { MemoryStore, fakeDirectus } from "./support/email-queue-memory";

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);

const h = vi.hoisted(() => ({ store: null as any, queue: true }));
vi.mock("#core/server/utils/email-send-queue", async (orig) => {
  const mod = await orig<typeof import("#core/server/utils/email-send-queue")>();
  return { ...mod, directusRecipientStore: () => h.store, emailQueueSchema: async () => h.queue };
});

const sent: any[] = [];
vi.mock("#core/server/utils/sendgrid", async (orig) => ({
  ...(await orig<typeof import("#core/server/utils/sendgrid")>()),
  sendOrganizationEmail: async (m: any) => {
    sent.push(m);
    return { success: true, messageId: `msg-${sent.length}` };
  },
}));

const ORG = { id: "org-a", name: "Oak Court", slug: "oak", street_address: "1 Elm St", city: "Austin", state: "TX", zip: "78701", email: "board@oak.test", settings: { cc_bcc_threshold: 5 } };
const TOKEN = (i: number) => `T${String(i).padStart(31, "x")}`;

let store: MemoryStore;
let directus: ReturnType<typeof fakeDirectus>;
let members: any[];
let org: any;
let body: any;

function people(n: number, over: (i: number) => Record<string, unknown> = () => ({})) {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return { id: `m-${i}`, first_name: `First${i}`, last_name: `Last${i}`, email: `p${i}@example.com`, outstanding_balance: 100 + i, units: [{ is_primary_unit: true, unit_id: { unit_number: `${i}A` } }], unsubscribe_token: TOKEN(i), ...over(i) };
  });
}

function stub() {
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u1" } }));
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, o: string) => {
    if (o !== ORG.id) throw Object.assign(new Error("403"), { statusCode: 403 });
  });
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appUrl: "https://app.test" },
    directus: { url: "https://d.test", staticToken: "t" },
  }));
  vi.stubGlobal("getTypedDirectus", () => directus);
}

function setup(n: number, over?: (i: number) => Record<string, unknown>) {
  members = people(n, over);
  store = new MemoryStore();
  h.store = store;
  for (const m of members) store.addMember({ id: m.id, email: m.email, unsubscribe_token: m.unsubscribe_token, email_bounced: m.email_bounced, email_community_opt_out: m.email_community_opt_out });
  directus = fakeDirectus(store, { org, members, board: ["chair@oak.test"] });
  stub();
}

beforeAll(async () => {
  org = { ...ORG };
  setup(1);
  await import("#core/server/api/email/send.post");
}, 120_000);

beforeEach(async () => {
  sent.length = 0;
  h.queue = true;
  org = { ...ORG, settings: { ...ORG.settings } };
  body = { organizationId: ORG.id, subject: "Hi {{first_name}}", content: "<p>Unit {{unit}} owes {{outstanding_balance}}</p>", emailType: "announcement", includeBoardFooter: false };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();
});

const send = async () => (await import("#core/server/api/email/send.post")).default as any;
const rows = () => [...store.rows.values()].sort((a, b) => a.position - b.position);
const writes = () => directus.ops.filter((o) => /^(create|update|delete)/.test(o.op));

describe("enqueue (D)", () => {
  it("31. refuses before any write on checkSendCompliance", async () => {
    setup(3);
    org.street_address = null;
    body.recipientIds = members.map((m) => m.id);
    await expect((await send())({})).rejects.toMatchObject({ statusCode: 400, data: { code: "sender_address_missing" } });
    expect(writes()).toEqual([]);
    expect(store.leases.size).toBe(0);
    expect(store.rows.size).toBe(0);
    expect(store.calls).toEqual([]);
  });

  it("32. writes suppressed rows with reasons and excludes them from total_recipients", async () => {
    setup(5, (i) => (i === 2 ? { email_bounced: true } : i === 4 ? { email_community_opt_out: true } : {}));
    body.recipientIds = members.map((m) => m.id);
    body.recipientIds.push("not-mine");
    h.queue = true;
    const res = await (await send())({});
    const r = rows();
    expect(r.map((x) => [x.member, x.status, x.suppressed_reason ?? null])).toEqual([
      ["m-1", "sent", null],
      ["m-3", "sent", null],
      ["m-5", "sent", null],
      ["m-2", "suppressed", "bounced"],
      ["m-4", "suppressed", "opted_out"],
    ]);
    expect(store.email(res.emailId)).toMatchObject({ total_recipients: 3, total_suppressed: 2 });
    expect(res.stats.suppressed).toEqual({ bounced: 1, optedOut: 1 });

    // Essential: the opted-out member is mailed; the bounced one still is not.
    setup(5, (i) => (i === 2 ? { email_bounced: true } : i === 4 ? { email_community_opt_out: true } : {}));
    body.recipientIds = members.map((m) => m.id);
    body.emailType = "notice";
    const res2 = await (await send())({});
    expect(rows().filter((x) => x.status === "suppressed").map((x) => x.member)).toEqual(["m-2"]);
    expect(store.email(res2.emailId).total_recipients).toBe(4);
  });

  it("33. refuses when everyone is suppressed: 400, no rows", async () => {
    setup(2, () => ({ email_bounced: true }));
    body.recipientIds = members.map((m) => m.id);
    await expect((await send())({})).rejects.toMatchObject({ statusCode: 400, data: { code: "all_recipients_suppressed" } });
    expect(store.rows.size).toBe(0);
    expect(store.leases.size).toBe(0);
  });

  it("34. mints tokens once for community mail and reads them back; essential mints nothing", async () => {
    setup(3, () => ({ unsubscribe_token: null }));
    body.recipientIds = members.map((m) => m.id);
    await (await send())({});
    const mints = directus.ops.filter((o) => o.op === "updateItemsBatch" && o.collection === "hoa_members");
    expect(mints).toHaveLength(1);
    expect(mints[0].data).toHaveLength(3);
    // The token is not copied into the row.
    expect(rows().every((x) => !JSON.stringify(x).includes(mints[0].data[0].unsubscribe_token))).toBe(true);

    setup(3, () => ({ unsubscribe_token: null }));
    body.recipientIds = members.map((m) => m.id);
    body.emailType = "notice";
    await (await send())({});
    expect(directus.ops.filter((o) => o.op === "updateItemsBatch")).toHaveLength(0);
  });

  it("35. writes rows in position order, 500 per batch, and sets total_recipients last", async () => {
    setup(1200);
    body.recipientIds = members.map((m) => m.id);
    const sizes: number[] = [];
    const log: string[] = [];
    const create = store.createRows.bind(store);
    store.createRows = async (batch) => {
      sizes.push(batch.length);
      log.push("rows");
      expect(batch.map((r) => r.position)).toEqual([...batch.map((r) => r.position)].sort((a, b) => a - b));
      return create(batch);
    };
    const update = store.updateEmail.bind(store);
    store.updateEmail = async (id, data) => {
      if ("total_recipients" in data) log.push(`total=${data.total_recipients}`);
      return update(id, data);
    };
    const res = await (await send())({});
    expect(sizes).toEqual([500, 500, 200]);
    expect(log).toEqual(["total=null", "rows", "rows", "rows", "total=1200"]);
    expect(res).toMatchObject({ queued: true, inline: false, phase: "sending", total: 1200 });
  });

  it("36. dedupe_key is unique per occurrence and the batch is refused on a collision", async () => {
    const { planRows, writeSnapshot } = await import("#core/server/utils/email-send-enqueue");
    store = new MemoryStore();
    store.addEmail({ id: "e1", status: "draft" });
    const plan = planRows({
      emailId: "e1", runKey: "m:k", recipients: people(3), suppressed: [], ccEmails: [], bccEmails: [], threshold: 5, merge: () => ({}),
    });
    expect(new Set(plan.rows.map((r) => r.dedupe_key)).size).toBe(3);
    plan.rows.push({ ...plan.rows[0]!, position: 4 });
    await expect(
      writeSnapshot(store, {
        emailId: "e1", runKey: "m:k", rows: plan.rows, total: 4, suppressedCount: 0, worker: "inline",
        clock: { now: () => Date.now() }, expect: () => true, restoreStatus: "draft",
      })
    ).rejects.toMatchObject({ errors: [{ extensions: { code: "RECORD_NOT_UNIQUE" } }] });
    expect(store.rows.size).toBe(0);
    expect(store.email("e1")).toMatchObject({ total_recipients: null, status: "draft" });
    expect(store.leases.size).toBe(0);
  });

  it("37. a member with no address is a failed row, not in total_recipients", async () => {
    setup(3, (i) => (i === 2 ? { email: null } : {}));
    body.recipientIds = members.map((m) => m.id);
    const res = await (await send())({});
    expect(rows().find((x) => x.member === "m-2")).toMatchObject({ status: "failed", error_message: "No email address", recipient_email: null });
    expect(store.email(res.emailId).total_recipients).toBe(2);
    expect(sent.map((m) => m.to)).toEqual(["p1@example.com", "p3@example.com"]);
  });

  it("38. the scheduled path enqueues and never sends inline; a compliance refusal still marks it failed", async () => {
    setup(3);
    store.addEmail({ id: "sched-1", organization: ORG.id, status: "scheduled", scheduled_at: "2026-11-01T10:00:00.000Z", email_type: "notice", recipient_filter: "all", subject: "Dues", web_slug: "dues" });
    const { sendEmailJob } = await import("#core/server/utils/sendEmailJob");
    const r = await sendEmailJob("sched-1");
    expect(r).toMatchObject({ queued: true, total: 3, delivered: 0 });
    expect(sent).toHaveLength(0);
    expect(store.email("sched-1")).toMatchObject({ status: "sending", total_recipients: 3, send_run_key: "s:2026-11-01T10:00:00.000Z" });
    expect(rows().every((x) => x.status === "queued")).toBe(true);

    // A community send from an org with no address: refused, marked failed by the tick's enqueue.
    setup(2);
    org.street_address = null;
    store.addEmail({ id: "sched-2", organization: ORG.id, status: "scheduled", scheduled_at: "2026-11-01T10:00:00.000Z", email_type: "newsletter", recipient_filter: "all", subject: "News", web_slug: "news" });
    const { enqueueDue } = await import("#core/server/utils/email-send-enqueue");
    const out = await enqueueDue(directus, store, { now: () => Date.parse("2026-11-03T12:00:00Z") });
    expect(out.refused).toEqual(["sched-2"]);
    expect(store.email("sched-2")).toMatchObject({ status: "failed" });
    expect(store.email("sched-2").send_errors[0]).toContain("no mailing address");
    expect(store.rows.size).toBe(0);
  });

  it("39. member_fields is the merge output, not the member", async () => {
    setup(1);
    body.recipientIds = ["m-1"];
    h.queue = true;
    await (await send())({});
    const mf = rows()[0]!.member_fields!;
    expect(Object.keys(mf).sort()).toEqual(MERGE_FIELDS.map((f) => f.token).sort());
    expect(Object.values(mf).every((v) => typeof v === "string")).toBe(true);
    expect(mf).toMatchObject({ first_name: "First1", unit_number: "1A", outstanding_balance: "$101.00" });
    expect(mf).not.toHaveProperty("units");
    expect(mf).not.toHaveProperty("unsubscribe_token");
    expect(mf).not.toHaveProperty("id");
  });

  it("40. small send writes copies on member rows; large send writes copy rows last", async () => {
    setup(3);
    body.recipientIds = members.map((m) => m.id);
    body.cc = ["@board"];
    body.bcc = ["p2@example.com", "pm@oak.test"];
    await (await send())({});
    expect(rows().every((x) => x.kind === "member")).toBe(true);
    expect(rows()[0]!.copies).toEqual({ cc: ["chair@oak.test"], bcc: ["p2@example.com", "pm@oak.test"] });
    expect(sent[0].cc).toEqual([{ email: "chair@oak.test" }]);

    setup(8);
    body.recipientIds = members.map((m) => m.id);
    const res = await (await send())({});
    const r = rows();
    expect(r.filter((x) => x.kind === "member").every((x) => x.copies === null)).toBe(true);
    // Copy rows after every member row; p2 is a member, so no copy for them.
    expect(r.slice(8).map((x) => [x.kind, x.recipient_email, x.member])).toEqual([
      ["copy", "chair@oak.test", null],
      ["copy", "pm@oak.test", null],
    ]);
    expect(store.email(res.emailId).total_recipients).toBe(10);
    // A copy row: no token, so no List-Unsubscribe header, the generic page.
    const copyMsg = sent.find((m) => m.to === "chair@oak.test");
    expect(copyMsg.headers).toEqual({});
    expect(copyMsg.customArgs.recipient_id).toBe(r[8]!.id);
  });

  it("41. inline tick runs for <= INLINE_MAX and is awaited; over the limit the response is immediate", async () => {
    setup(3);
    body.recipientIds = members.map((m) => m.id);
    const res = await (await send())({});
    expect(res).toMatchObject({ queued: true, inline: true, phase: "done", progress: { sent: 3, total: 3 } });
    expect(sent).toHaveLength(3);
    expect(sent[0]).toMatchObject({ subject: "Hi First1", customArgs: { email_id: res.emailId, run_key: expect.stringMatching(/^m:/) } });
    expect(sent[0].html).toContain("Unit 1A owes $101.00");
    expect(sent[0].headers["List-Unsubscribe"]).toContain(`token=${TOKEN(1)}`);
    expect(store.email(res.emailId)).toMatchObject({ status: "sent", total_sent: 3, delivered_count: 3 });

    setup(51);
    sent.length = 0;
    body.recipientIds = members.map((m) => m.id);
    const big = await (await send())({});
    expect(big).toMatchObject({ queued: true, inline: false, phase: "sending", total: 51 });
    expect(sent).toHaveLength(0);
  });

  it("409s a re-send of an email that is already being sent, before any write", async () => {
    setup(2);
    store.addEmail({ id: "busy", organization: ORG.id, status: "sending" });
    body.recipientIds = members.map((m) => m.id);
    body.emailId = "busy";
    await expect((await send())({})).rejects.toMatchObject({ statusCode: 409, data: { code: "send_in_progress" } });
    expect(writes()).toEqual([]);
  });

  it("62. checkSendCompliance and partitionAudience run once per send", async () => {
    const cls = await import("#core/shared/email/email-class");
    const un = await import("#core/shared/email/unsubscribe");
    const p = vi.spyOn(cls, "partitionAudience");
    const c = vi.spyOn(un, "checkSendCompliance");
    setup(60);
    body.recipientIds = members.map((m) => m.id);
    await (await send())({});
    expect(p).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });
});
