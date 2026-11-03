/**
 * The tick, `GET /api/email/cron/continue-sends` (docs/spec-email-send-queue.md
 * §7.1; §10 group E): its auth, its four phases in order, and what parks a
 * send instead of failing it.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { PREPARE_STALE_MS, TICK_BUDGET_MS } from "#core/server/utils/email-send-constants";
import { PREPARE_CLOSED_MESSAGE, runSendTick } from "#core/server/utils/email-send-queue";
import { MemoryStore, fakeClock, fakeDirectus, fakeSendGrid, seedSending, simpleDeps } from "./support/email-queue-memory";

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

const APP_ADMIN_ROLE = "role-app-admin";
const ORG = { id: "org-a", name: "Oak Court", slug: "oak", street_address: "1 Elm St", city: "Austin", zip: "78701", settings: null };

let store: MemoryStore;
let directus: ReturnType<typeof fakeDirectus>;
let org: any;
let session: any;
let headers: Record<string, string>;
let fetchOk: boolean;

function stub() {
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getHeader", (_e: unknown, name: string) => headers[name.toLowerCase()]);
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appUrl: "https://app.test", directusRoleAppAdmin: APP_ADMIN_ROLE },
    directus: { url: "https://d.test", staticToken: "t" },
  }));
  vi.stubGlobal("getTypedDirectus", () => directus);
  vi.stubGlobal("fetch", async () =>
    fetchOk
      ? { ok: true, status: 200, headers: new Headers({ "content-type": "application/pdf" }), arrayBuffer: async () => new ArrayBuffer(4) }
      : { ok: false, status: 500 }
  );
}

function setup(memberCount = 3) {
  store = new MemoryStore();
  h.store = store;
  const members = Array.from({ length: memberCount }, (_, k) => ({ id: `m-${k + 1}`, first_name: `F${k + 1}`, email: `p${k + 1}@example.com` }));
  for (const m of members) store.addMember({ id: m.id, email: m.email });
  directus = fakeDirectus(store, { org, members });
  stub();
}

beforeAll(async () => {
  org = { ...ORG };
  setup();
  await import("#core/server/api/email/cron/continue-sends");
}, 120_000);

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  headers = {};
  session = null;
  fetchOk = true;
  sent.length = 0;
  h.queue = true;
  org = { ...ORG };
  setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

const route = async () => (await import("#core/server/api/email/cron/continue-sends")).default as any;

/** A sending email whose rows the real renderer can render (its body lives on the store's email row). */
async function seedRenderable(n = 3, extra: Record<string, unknown> = {}) {
  const { emailId } = await seedSending(store, n, { emailId: "e-1" });
  Object.assign(store.email(emailId), {
    organization: ORG.id, subject: "Hello {{first_name}}", content: "<p>Hi</p>", email_type: "notice", content_mode: "visual",
    include_board_footer: false, attachments: [], ...extra,
  });
  // seedSending's members are p1..pn; give them to the fake Directus too.
  return emailId;
}

describe("the tick (E)", () => {
  it("42. 401 without the secret or a session, 403 for a non-app-admin session, 200 for the secret", async () => {
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 401 });
    session = { user: { id: "u1", role: "role-hoa-admin" } };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 403 });
    session = null;
    headers = { authorization: "Bearer s3cret" };
    await expect((await route())({})).resolves.toMatchObject({ success: true });
    headers = {};
    session = { user: { id: "u1", role: APP_ADMIN_ROLE } };
    await expect((await route())({})).resolves.toMatchObject({ success: true });
  });

  it("answers provisioned:false and sends nothing before the schema exists", async () => {
    h.queue = false;
    headers = { "x-cron-secret": "s3cret" };
    await expect((await route())({})).resolves.toEqual({ success: true, provisioned: false });
    expect(directus.ops.filter((o) => o.collection === "hoa_emails")).toHaveLength(0);
  });

  it("43. enqueues due scheduled emails before running batches — and runs them in the same tick", async () => {
    headers = { authorization: "Bearer s3cret" };
    store.addEmail({
      id: "sched", organization: ORG.id, status: "scheduled", scheduled_at: "2026-01-01T09:00:00.000Z",
      email_type: "notice", recipient_filter: "all", subject: "Dues {{first_name}}", content: "<p>Due</p>",
      content_mode: "visual", include_board_footer: false, web_slug: "dues",
    });
    const leasePurposes: string[] = [];
    const insert = store.insertLease.bind(store);
    store.insertLease = async (l) => (leasePurposes.push(l.purpose), insert(l));
    const res = await (await route())({});
    expect(res).toMatchObject({ enqueued: 1, completed: 1 });
    expect(leasePurposes).toEqual(["prepare", "send"]);
    expect(sent.map((m) => m.to).sort()).toEqual(["p1@example.com", "p2@example.com", "p3@example.com"]);
    expect(store.email("sched")).toMatchObject({ status: "sent", total_sent: 3, next_run_at: null });
  });

  it("44. runs sending emails oldest first and shares the budget", async () => {
    const clock = fakeClock();
    await seedSending(store, 2, { emailId: "newer", startedAt: "2026-11-03T11:59:00.000Z", runKey: "m:b" });
    await seedSending(store, 2, { emailId: "older", startedAt: "2026-11-03T11:00:00.000Z", runKey: "m:a" });
    const sg = fakeSendGrid();
    const budgets: Array<[string, number]> = [];
    const deps = simpleDeps(sg);
    const res = await runSendTick({
      store, worker: "cron", budgetMs: TICK_BUDGET_MS, clock,
      depsFor: (email) => ({
        load: async () => {
          budgets.push([email.id, clock.now()]);
          clock.advance(20_000); // the first send eats most of the tick
          return deps.load();
        },
        deliver: deps.deliver,
      }),
    });
    // Oldest first; the second send runs on what the first left (45 − 20 = 25 s),
    // spends 20 s loading, and stops before claiming with 5 s < the chunk reserve.
    expect(res.runs.map((r) => [r.emailId, r.stopped])).toEqual([
      ["older", "done"],
      ["newer", "budget"],
    ]);
    expect(budgets.map(([id]) => id)).toEqual(["older", "newer"]);
    expect(store.rowsOf("newer").every((r) => r.status === "queued")).toBe(true);
    // …and finishes next tick.
    const next = await runSendTick({ store, worker: "cron", budgetMs: TICK_BUDGET_MS, clock, depsFor: () => simpleDeps(sg) });
    expect(next.runs.map((r) => r.emailId)).toEqual(["newer"]);
    expect(store.email("newer").status).toBe("sent");
  });

  it("45. closes a send stuck preparing past PREPARE_STALE_MS: failed, the fixed message, its rows deleted", async () => {
    const clock = fakeClock();
    store.addEmail({ id: "prep", status: "sending", total_recipients: null, send_run_key: "m:p", send_started_at: new Date(clock.t).toISOString() });
    await store.createRows([{ email: "prep", run_key: "m:p", kind: "member", position: 1, dedupe_key: "prep:m:p:m:x", member: "m-1", recipient_email: "p1@example.com", recipient_name: null, status: "queued", member_fields: {}, copies: null }]);
    await store.insertLease({ email: "prep", token: "dead", purpose: "prepare", worker: "inline", started_at: new Date(clock.t).toISOString() });
    const sg = fakeSendGrid();
    let r = await runSendTick({ store, worker: "cron", budgetMs: TICK_BUDGET_MS, clock, depsFor: () => simpleDeps(sg) });
    expect(r.closed).toBe(0); // too young
    clock.advance(PREPARE_STALE_MS + 1);
    r = await runSendTick({ store, worker: "cron", budgetMs: TICK_BUDGET_MS, clock, depsFor: () => simpleDeps(sg) });
    expect(r.closed).toBe(1);
    expect(store.email("prep")).toMatchObject({ status: "failed", send_errors: [PREPARE_CLOSED_MESSAGE] });
    expect(store.rowsOf("prep")).toHaveLength(0);
    expect(sg.calls).toHaveLength(0);
    expect(store.leases.size).toBe(0);
  });

  it("46. completes a done-but-unwritten send", async () => {
    const clock = fakeClock();
    await seedSending(store, 2, { emailId: "done" });
    for (const row of store.rowsOf("done")) Object.assign(row, { status: "sent" });
    const sg = fakeSendGrid();
    const r = await runSendTick({ store, worker: "cron", budgetMs: TICK_BUDGET_MS, clock, depsFor: () => simpleDeps(sg) });
    expect(r.completed).toBe(1);
    expect(store.email("done")).toMatchObject({ status: "sent", total_sent: 2, recipient_count: 2, delivered_count: 2 });
    expect(sg.calls).toHaveLength(0);
  });

  it("47. a failing attachment load stops the run before any claim; the next tick clears it after a settled chunk", async () => {
    headers = { authorization: "Bearer s3cret" };
    const id = await seedRenderable(3, { attachments: [{ directus_files_id: { id: "f1", filename_download: "budget.pdf", type: "application/pdf" } }] });
    fetchOk = false;
    const res = await (await route())({});
    expect(res.runs[0]).toMatchObject({ emailId: id, stopped: "parked" });
    expect(store.email(id).send_last_error).toBe("Could not load attachment budget.pdf");
    expect(store.rowsOf(id).every((r) => r.status === "queued" && r.claim === null)).toBe(true);
    expect(store.calls).not.toContain("claim");
    expect(sent).toHaveLength(0);

    fetchOk = true;
    await (await route())({});
    expect(store.email(id)).toMatchObject({ status: "sent", send_last_error: null });
    expect(sent[0].attachments).toEqual([expect.objectContaining({ filename: "budget.pdf", disposition: "attachment" })]);
  });

  it("48. checkSendCompliance failing mid-send parks the send: rows queued, send_last_error set, status unchanged", async () => {
    headers = { authorization: "Bearer s3cret" };
    const id = await seedRenderable(2, { email_type: "newsletter" });
    org.street_address = null;
    setupKeepStore();
    const res = await (await route())({});
    expect(res.runs[0]).toMatchObject({ stopped: "parked" });
    expect(store.email(id)).toMatchObject({ status: "sending" });
    expect(store.email(id).send_last_error).toContain("no mailing address");
    expect(store.rowsOf(id).every((r) => r.status === "queued")).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

/** Re-point the fake Directus at the edited org without dropping the store. */
function setupKeepStore() {
  const members = [...store.members.values()].map((m) => ({ ...m }));
  directus = fakeDirectus(store, { org, members });
  stub();
}
