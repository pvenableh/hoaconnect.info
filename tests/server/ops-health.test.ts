/**
 * The operator console's health page (docs/plan-operator-console.md, Phase 4).
 *
 * The arithmetic (push platforms, AI usage, low wallets, overdue jobs), the
 * job heartbeat (never fails a job, records real runs only, refuses a stray
 * caller before running anything), and GET /api/ops/health on a MemoryDirectus
 * and a fake Stripe: who may read it, each section, and that no email address
 * or user agent leaves it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({
  stripe: null as any,
  session: null as any,
  queue: true,
  storage: {} as Record<string, any>,
  config: {} as any,
  failCollection: null as string | null,
  cronSecret: false,
  body: {} as any,
}));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.mock("#core/server/utils/stripe", () => ({
  getStripe: () => h.stripe,
  isStripeLiveMode: () => false,
  getStripeWebhookSecrets: () => (h.config.webhookSecrets ?? ["whsec_x"]),
}));
vi.mock("#core/server/utils/email-send-queue", () => ({ emailQueueSchema: async () => h.queue }));
vi.mock("#core/server/utils/storage-enforcement", () => ({
  getOrgStorage: async (id: string) => h.storage[id] ?? { usedBytes: 0, limitBytes: null, remainingBytes: null, plan: null },
}));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const health = await import("#core/shared/ops/health");
const jobs = await import("#core/shared/ops/jobs");
const heartbeat = await import("#core/server/utils/job-heartbeat");
const opsData = await import("#core/server/utils/ops-data");
const route = (await import("#core/server/api/ops/health.get")).default as (e: H3Event) => Promise<any>;

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app-admin", support: "role-platform-support", hoaAdmin: "role-hoa-admin", member: "role-member" };
const NOW = new Date("2026-11-10T12:00:00Z");
const DAY = 86_400_000;
const iso = (days: number, minutes = 0) => new Date(NOW.getTime() + days * DAY + minutes * 60_000).toISOString();

let db: MemoryDirectus;
let directusCalls: number;

const directusRequest = async (op: any) => {
  directusCalls += 1;
  if (h.failCollection && op.collection === h.failCollection) throw new Error(`no ${op.collection}`);
  switch (op.op) {
    case "aggregate": {
      const q = op.options.query ?? op.options;
      const rows = db.all(op.collection, q?.filter);
      const groupBy: string[] | undefined = op.options.groupBy;
      if (!groupBy) return [{ count: rows.length }];
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r[groupBy[0]!], (counts.get(r[groupBy[0]!]) ?? 0) + 1);
      return [...counts].map(([k, count]) => ({ [groupBy[0]!]: k, count: String(count) }));
    }
    case "readUsers":
      return db.all("directus_users", op.query.filter);
    case "readItems": {
      // Sort and limit, as Directus does (MemoryDirectus doesn't sort).
      const q = op.query ?? {};
      let rows = db.all(op.collection, q.filter).map((r) => ({ ...r }));
      const sort: string | undefined = q.sort?.[0];
      if (sort) {
        const desc = sort.startsWith("-");
        const f = desc ? sort.slice(1) : sort;
        rows.sort((a, b) => String(a[f] ?? "").localeCompare(String(b[f] ?? "")) * (desc ? -1 : 1));
      }
      if (typeof q.limit === "number" && q.limit >= 0) rows = rows.slice(0, q.limit);
      return rows;
    }
  }
  return db.request(op);
};

function seed() {
  db = new MemoryDirectus();
  db.seed("hoa_organizations", [
    { id: "harbor", name: "Harbor Court", slug: "harbor", subscription_status: "active", storage_used_bytes: 3 * 1024 ** 3 },
    { id: "pines", name: "Pines", slug: "pines", subscription_status: "trial", storage_used_bytes: 0 },
    { id: "oak", name: "Oak Row", slug: "oak", subscription_status: "active", storage_used_bytes: 512 * 1024 },
  ]);
  db.seed("billing_accounts", []);
  db.seed("subscription_plans", []);
  db.seed("hoa_units", []);
  db.seed("ops_job_heartbeats", [
    { id: "email-continue-sends", last_started_at: iso(0, -1), last_finished_at: iso(0, -1), last_status: "ok", last_ok_at: iso(0, -1), last_via: "cron", last_summary: { runs: 0 } },
    { id: "reminders", last_started_at: iso(0, -200), last_finished_at: iso(0, -200), last_status: "ok", last_ok_at: iso(0, -200) },
    { id: "ai-notices", last_started_at: iso(-1), last_finished_at: iso(-1), last_status: "error", last_error: "Directus timeout", last_ok_at: iso(-2) },
  ]);
  db.seed("hoa_reminder_log", [{ organization: "harbor", date_created: iso(-3) }, { organization: "harbor", date_created: iso(0, -200) }]);
  db.seed("hoa_emails", [
    { id: "e-stuck", organization: "harbor", status: "sending", last_run_at: iso(0, -45), date_updated: iso(0, -45), recipient_count: 40 },
    { id: "e-moving", organization: "harbor", status: "sending", last_run_at: iso(0, -2), date_updated: iso(0, -2) },
    { id: "e-late", organization: "oak", status: "scheduled", scheduled_at: iso(0, -60) },
    { id: "e-failed", organization: "oak", status: "failed", date_updated: iso(-2) },
    { id: "e-partly", organization: "harbor", status: "sent", sent_at: iso(-5), failed_count: 3 },
    { id: "e-old", organization: "harbor", status: "failed", date_updated: iso(-60) },
  ]);
  db.seed("hoa_email_send_leases", [{ id: "l1", started_at: iso(0, -30), purpose: "send" }, { id: "l2", started_at: iso(0, -1), purpose: "send" }]);
  db.seed("hoa_email_activity", [
    { event: "bounce", organization: "harbor", email: "rita@harbor.test", date_created: iso(-1), bounce_type: "hard" },
    { event: "bounce", organization: "harbor", email: "tom@harbor.test", date_created: iso(-2) },
    { event: "dropped", organization: "oak", email: "x@oak.test", date_created: iso(-1) },
    { event: "deferred", organization: "oak", email: "y@oak.test", date_created: iso(-1) },
    { event: "delivered", organization: "oak", email: "z@oak.test", date_created: iso(-1) },
    { event: "bounce", organization: "oak", email: "old@oak.test", date_created: iso(-20) },
  ]);
  db.seed("ai_transactions", [
    { organization: "harbor", type: "debit", credits: -12, feature: "draft", model: "claude-sonnet-5-5", input_tokens: 1000, output_tokens: 300, date_created: iso(-1) },
    { organization: "harbor", type: "debit", credits: -8, feature: "chat", model: "claude-sonnet-5-5", input_tokens: 600, output_tokens: 200, date_created: iso(-3) },
    { organization: "oak", type: "purchase", credits: 500, date_created: iso(-4) },
    { organization: "oak", type: "debit", credits: -5, feature: "ask", model: "claude-haiku-5-5", input_tokens: 200, output_tokens: 50, date_created: iso(-45) },
  ]);
  db.seed("ai_wallets", [
    { organization: "harbor", balance_credits: 20, allowance_credits: 400 },
    { organization: "oak", balance_credits: 380, allowance_credits: 400 },
  ]);
  db.seed("push_subscriptions", [
    { user: "u1", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", last_used_at: iso(-2), date_created: iso(-40) },
    { user: "u2", user_agent: "Mozilla/5.0 (Linux; Android 15)", last_used_at: null, date_created: iso(-120) },
    { user: "u3", user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", last_used_at: iso(-1), date_created: iso(-10) },
  ]);
  db.seed("directus_users", []);
  db.seed("hoa_members", []);

  const pager = (items: any[]) => vi.fn(async () => ({ data: items, has_more: false }));
  h.stripe = {
    subscriptions: { list: pager([{ id: "sub_a", status: "active", customer: "cus_a", metadata: { app: "hoaconnect" }, items: { data: [] } }]) },
    events: {
      list: pager([
        { id: "evt_1", type: "invoice.paid", created: Math.floor(NOW.getTime() / 1000) - 7200, pending_webhooks: 1, data: { object: { object: "invoice", customer: "cus_a" } } },
        { id: "evt_2", type: "invoice.paid", created: Math.floor(NOW.getTime() / 1000) - 3600, pending_webhooks: 1, data: { object: { object: "invoice", customer: "cus_other", metadata: { app: "another" } } } },
      ]),
    },
  };
}

const stripeCalls = () => (h.stripe.subscriptions.list.mock.calls.length as number) + h.stripe.events.list.mock.calls.length;
const as = (role: string | null, id = "u-staff") => {
  h.session = role === null ? null : { user: { id, role } };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  seed();
  directusCalls = 0;
  h.queue = true;
  h.failCollection = null;
  h.cronSecret = false;
  h.body = {};
  h.storage = { harbor: { usedBytes: 3 * 1024 ** 3, limitBytes: 5 * 1024 ** 3, remainingBytes: 2 * 1024 ** 3, plan: "boutique" } };
  h.config = {
    sendgridApiKey: "SG.x",
    anthropicApiKey: "sk-ant-x",
    voyageApiKey: "",
    vapidPrivateKey: "priv",
    public: { directusRoleAppAdmin: ROLE.appAdmin, directusRolePlatformSupport: ROLE.support, directusRoleHoaAdmin: ROLE.hoaAdmin, vapidPublicKey: "pub" },
  };
  opsData._resetOpsCache();
  heartbeat._resetJobHeartbeat();
  as(ROLE.appAdmin);
  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  vi.stubGlobal("useRuntimeConfig", () => h.config);
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getHeader", (_e: unknown, name: string) => (h.cronSecret && name === "authorization" ? "Bearer secret" : undefined));
  vi.stubEnv("CRON_SECRET", "secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// ── Arithmetic ──────────────────────────────────────────────────────────────

describe("health arithmetic", () => {
  it("names the push platform from the user agent", () => {
    expect(health.pushPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("ios");
    expect(health.pushPlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(health.pushPlatform("Mozilla/5.0 (Windows NT 10.0)")).toBe("windows");
    expect(health.pushPlatform(null)).toBe("other");
  });

  it("counts active and stale subscriptions per platform", () => {
    const s = health.summarizePush(db.all("push_subscriptions"), NOW);
    expect(s.total).toBe(3);
    expect(s.byPlatform.ios).toEqual({ total: 1, active: 1, stale: 0 });
    expect(s.byPlatform.android).toEqual({ total: 1, active: 0, stale: 1 });
  });

  it("adds up AI credits by kind and tokens by model", () => {
    const u = health.summarizeAiUsage(db.all("ai_transactions"));
    expect(u.credits).toEqual({ debit: 25, purchase: 500, grant: 0, refund: 0 });
    expect(u.byModel["claude-sonnet-5-5"]).toEqual({ credits: 20, inputTokens: 1600, outputTokens: 500, calls: 2 });
    expect(u.byFeature).toEqual({ draft: 12, chat: 8, ask: 5 });
    expect(u.lastDebitAt).toBe(iso(-1));
  });

  it("flags a wallet under a tenth of its allowance, not one with no AI plan", () => {
    expect(health.walletLow({ balance_credits: 20, allowance_credits: 400 })).toBe(true);
    expect(health.walletLow({ balance_credits: 0, allowance_credits: 400 })).toBe(true);
    expect(health.walletLow({ balance_credits: 0, allowance_credits: 0 })).toBe(false);
    expect(health.walletLow({ balance_credits: 380, allowance_credits: 400 })).toBe(false);
  });

  it("calls a job overdue after two missed runs plus slack", () => {
    const minute = { everyMinutes: 1, runner: "vercel" as const };
    expect(jobs.jobOverdue(minute, iso(0, -6), NOW)).toBe(false);
    expect(jobs.jobOverdue(minute, iso(0, -8), NOW)).toBe(true);
    const hourlyGithub = { everyMinutes: 60, runner: "github" as const };
    expect(jobs.jobOverdue(hourlyGithub, iso(0, -140), NOW)).toBe(false);
    expect(jobs.jobOverdue(hourlyGithub, iso(0, -160), NOW)).toBe(true);
    expect(jobs.jobOverdue(minute, null, NOW)).toBe(true);
  });
});

// ── The heartbeat ───────────────────────────────────────────────────────────

describe("job heartbeat", () => {
  it("creates the job's row on its first run and updates it after", async () => {
    await heartbeat.recordJobRun("billing-worker", { startedAt: new Date(iso(0, -2)), ok: true, via: "cron", summary: { orgs: 3 } });
    expect(db.one("ops_job_heartbeats", "billing-worker")).toMatchObject({ last_status: "ok", last_via: "cron", last_ok_at: NOW.toISOString(), last_summary: { orgs: 3 } });
    await heartbeat.recordJobRun("billing-worker", { startedAt: new Date(iso(0, -1)), ok: false, error: new Error("Stripe down") });
    expect(db.one("ops_job_heartbeats", "billing-worker")).toMatchObject({
      last_status: "error",
      last_error: "Stripe down",
      last_ok_at: NOW.toISOString(), // kept from the run that worked
    });
    expect(db.all("ops_job_heartbeats", { id: { _eq: "billing-worker" } })).toHaveLength(1);
  });

  it("never fails the job, and rests after a failed write", async () => {
    h.failCollection = "ops_job_heartbeats";
    await expect(heartbeat.recordJobRun("reminders", { startedAt: NOW, ok: true })).resolves.toBeUndefined();
    const calls = directusCalls;
    await heartbeat.recordJobRun("reminders", { startedAt: NOW, ok: true });
    expect(directusCalls).toBe(calls); // resting: no second try for ten minutes
  });

  it("passes the job's result and error through, and skips dry runs", async () => {
    await expect(heartbeat.withJobHeartbeat("data-export", {}, async () => 42)).resolves.toBe(42);
    await expect(heartbeat.withJobHeartbeat("data-export", {}, async () => Promise.reject(new Error("disk full")))).rejects.toThrow("disk full");
    expect(db.one("ops_job_heartbeats", "data-export")).toMatchObject({ last_status: "error", last_error: "disk full" });
    const before = JSON.stringify(db.one("ops_job_heartbeats", "data-export"));
    await heartbeat.withJobHeartbeat("data-export", { dry: true }, async () => 1);
    expect(JSON.stringify(db.one("ops_job_heartbeats", "data-export"))).toBe(before);
  });

  it("a cron route refuses a stray caller before running or recording anything", async () => {
    const work = vi.fn(async () => ({ ok: true }));
    const handler = heartbeat.cronJobHandler("reminders", {}, work) as unknown as (e: H3Event) => Promise<any>;
    as(ROLE.member, "u-rita");
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
    as(null);
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 });
    expect(work).not.toHaveBeenCalled();
    expect(db.one("ops_job_heartbeats", "reminders")!.last_finished_at).toBe(iso(0, -200));
  });

  it("records a cron route's run, and not its dry runs", async () => {
    h.cronSecret = true;
    const handler = heartbeat.cronJobHandler(
      "ai-notices",
      { isDry: heartbeat.dryRunInBody, summarize: (r: any) => ({ organizations: r.organizations }) },
      async () => ({ organizations: 4 })
    ) as unknown as (e: H3Event) => Promise<any>;
    h.body = { dryRun: true };
    await handler(event);
    expect(db.one("ops_job_heartbeats", "ai-notices")!.last_status).toBe("error");
    h.body = {};
    await handler(event);
    expect(db.one("ops_job_heartbeats", "ai-notices")).toMatchObject({ last_status: "ok", last_via: "cron", last_summary: { organizations: 4 }, last_error: null });
  });

  it("a route open to others records only the runs it's told to", async () => {
    const work = vi.fn(async () => ({ expired: 2 }));
    const handler = heartbeat.cronJobHandler("ai-actions-expire", { recordWhen: () => null }, work) as unknown as (e: H3Event) => Promise<any>;
    as(ROLE.member, "u-rita"); // the route's own checks decide; the wrapper adds none
    await expect(handler(event)).resolves.toEqual({ expired: 2 });
    expect(db.one("ops_job_heartbeats", "ai-actions-expire")).toBeUndefined();
  });
});

// ── GET /api/ops/health ─────────────────────────────────────────────────────

describe("GET /api/ops/health", () => {
  it("refuses everyone but staff before Directus or Stripe is asked anything", async () => {
    for (const role of [ROLE.hoaAdmin, ROLE.member, ""]) {
      as(role, "u-x");
      await expect(route(event)).rejects.toMatchObject({ statusCode: 403 });
    }
    as(null);
    await expect(route(event)).rejects.toMatchObject({ statusCode: 401 });
    expect(directusCalls).toBe(0);
    expect(stripeCalls()).toBe(0);
  });

  it("is open to Platform Support", async () => {
    as(ROLE.support);
    await expect(route(event)).resolves.toMatchObject({ heartbeatsProvisioned: true });
  });

  it("shows each job's last run and whether it's on time", async () => {
    const { jobs: list } = await route(event);
    const by = Object.fromEntries(list.map((j: any) => [j.key, j]));
    expect(by["email-continue-sends"]).toMatchObject({ status: "ok", lastVia: "cron", summary: { runs: 0 } });
    expect(by.reminders).toMatchObject({ status: "overdue", lastRunAt: iso(0, -200), lastActivityAt: iso(0, -200) });
    expect(by["ai-notices"]).toMatchObject({ status: "error", lastError: "Directus timeout", lastOkAt: iso(-2) });
    expect(by["billing-worker"]).toMatchObject({ status: "never", lastRunAt: null });
    expect(list.map((j: any) => j.key)).toEqual(jobs.OPS_JOB_KEYS);
  });

  it("falls back to the last sign of work before the heartbeats exist", async () => {
    h.failCollection = "ops_job_heartbeats";
    const res = await route(event);
    expect(res.heartbeatsProvisioned).toBe(false);
    const reminders = res.jobs.find((j: any) => j.key === "reminders");
    expect(reminders).toMatchObject({ status: null, lastRunAt: null, lastActivityAt: iso(0, -200) });
    expect(res.notes).toEqual(["Jobs record their runs once `pnpm run create:ops-job-heartbeats` has created the collection."]);
  });

  it("finds stuck and late sends, failures and open leases", async () => {
    const { email } = await route(event);
    expect(email.sending).toBe(2);
    expect(email.stuck).toEqual([{ community: "Harbor Court", communityId: "harbor", since: iso(0, -45) }]);
    expect(email.lateScheduled).toEqual([{ community: "Oak Row", communityId: "oak", scheduledAt: iso(0, -60) }]);
    expect(email.failed30d).toHaveLength(1);
    expect(email.partlyFailed30d).toEqual({ emails: 1, recipients: 3 });
    expect(email.leases).toEqual({ open: 2, older: 1 });
  });

  it("counts what SendGrid didn't deliver this week, by kind and by community", async () => {
    const { email } = await route(event);
    expect(email.undelivered7d.byEvent).toEqual({ bounce: 2, dropped: 1, deferred: 1 });
    expect(email.undelivered7d.topCommunities).toEqual([
      { communityId: "harbor", community: "Harbor Court", count: 2 },
      { communityId: "oak", community: "Oak Row", count: 1 },
    ]);
  });

  it("reports AI keys, 30 days of usage and low wallets", async () => {
    const { ai } = await route(event);
    expect(ai.keys).toEqual({ anthropic: true, voyage: false });
    expect(ai.usage30d.credits.debit).toBe(20);
    expect(ai.wallets.low).toEqual([expect.objectContaining({ communityId: "harbor", community: "Harbor Court", balance: 20 })]);
  });

  it("lists storage by community with its limit", async () => {
    const { storage } = await route(event);
    expect(storage.communitiesWithFiles).toBe(2);
    expect(storage.communities[0]).toEqual({ communityId: "harbor", community: "Harbor Court", usedBytes: 3 * 1024 ** 3, limitBytes: 5 * 1024 ** 3, percent: 60 });
    expect(storage.communities[1]).toMatchObject({ communityId: "oak", limitBytes: null, percent: null });
  });

  it("counts push subscriptions and our undelivered Stripe events", async () => {
    const { push, webhooks } = await route(event);
    expect(push).toMatchObject({ total: 3, vapid: true });
    expect(push.platforms.map((p: any) => p.key)).toEqual(["ios", "android", "macos"]);
    expect(webhooks).toMatchObject({ undelivered7d: 1, types: { "invoice.paid": 1 }, signingSecrets: 1 });
  });

  it("blanks only the section that can't be read", async () => {
    h.failCollection = "hoa_email_activity";
    const res = await route(event);
    expect(res.email).toBeNull();
    expect(res.ai).not.toBeNull();
    expect(res.notes).toContain("Email couldn't be read.");
  });

  it("never sends an email address or a user agent", async () => {
    const body = JSON.stringify(await route(event));
    for (const s of ["@harbor.test", "@oak.test", "Mozilla", "iPhone OS"]) expect(body).not.toContain(s);
  });
});
