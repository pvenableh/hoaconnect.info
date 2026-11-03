/**
 * Phase 3a's signed-in routes, and the send path's class rules end to end.
 * Every route here writes with the ADMIN token, so the route is the fence:
 *
 *   · /api/user/email-subscription reads and writes the SESSION user's own
 *     membership in the org named — never a member id from the caller;
 *   · /api/hoa/member-email-status is org-admin only, and its reads and its
 *     Clear carry the org in the filter, so an admin of one community can't
 *     clear a member of another by id; Clear writes the ledger;
 *   · /api/email/save now has send.post's gate (a scheduled email is a send);
 *   · /api/email/send refuses community mail from an org with no address (400,
 *     before anyone is read or mailed) and applies the class rules: bounced
 *     drop from both classes, opted-out from community only, and only community
 *     mail carries List-Unsubscribe.
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
  createItem: (collection: string, data: any) => ({ op: "createItem", collection, data }),
  updateItem: (collection: string, id: string, data: any) => ({ op: "updateItem", collection, id, data }),
  updateItemsBatch: (collection: string, data: any[]) => ({ op: "updateItemsBatch", collection, data }),
  readFieldsByCollection: (collection: string) => ({ op: "readFields", collection }),
  readFiles: (query: any) => ({ op: "readFiles", collection: "directus_files", query }),
}));

const ledger: any[] = [];
let failLedger = false;
vi.mock("#core/server/utils/audit-log", () => ({
  writeAuditEntry: async (entry: any) => {
    if (failLedger) throw new Error("ledger down");
    ledger.push(entry);
    return "audit-1";
  },
}));

const sent: any[] = [];
vi.mock("#core/server/utils/sendgrid", async (orig) => ({
  // The real resolveSender (Phase 3b's shared renderer calls it); only the send is faked.
  ...(await orig<typeof import("#core/server/utils/sendgrid")>()),
  sendOrganizationEmail: async (m: any) => {
    sent.push(m);
    return { success: true, messageId: `msg-${sent.length}` };
  },
}));

const ORG_A = "org-a";
const ORG_B = "org-b";
const ME = "user-me";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012-_9";
const ALL_MEMBER_FIELDS = [
  "id",
  "email",
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
let session: any;
let query: Record<string, unknown>;
let body: any;
let provisioned: boolean;
let adminOf: string[];
let grantOf: string[];
/** Per-collection read answers. */
let reads: Record<string, (op: Op) => any>;

function stubGlobals() {
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("requireUserSession", async () => {
    if (!session) throw Object.assign(new Error("401"), { statusCode: 401 });
    return session;
  });
  vi.stubGlobal("getQuery", () => query);
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.statusMessage || o.message), o));
  vi.stubGlobal("requireAdminAccess", async (_e: unknown, org: string) => {
    if (!adminOf.includes(org)) throw Object.assign(new Error("403"), { statusCode: 403 });
    return { isAdmin: true };
  });
  vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, org: string, grant: string) => {
    if (grant !== "communications" || !grantOf.includes(org)) throw Object.assign(new Error("403"), { statusCode: 403 });
  });
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appUrl: "https://app.test" },
    directus: { url: "https://d.test", staticToken: "t" },
  }));
  vi.stubGlobal("buildUniqueWebSlug", (s: string) => s.toLowerCase().replace(/\W+/g, "-"));
  vi.stubGlobal("resolveCcBccEmails", async () => []);
  vi.stubGlobal("resolveEmailBranding", () => ({ headerText: null, footerImage: null, homepageUrl: null }));
  vi.stubGlobal("applyHeaderTextTokens", () => "");
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: Op) => {
      ops.push(op);
      if (op.op === "readFields") {
        if (op.collection === "hoa_members") return (provisioned ? ALL_MEMBER_FIELDS : ["id", "email"]).map((field) => ({ field }));
        return (provisioned ? ["id", "email_class"] : ["id"]).map((field) => ({ field }));
      }
      if (op.op === "readItems" || op.op === "readItem") return reads[op.collection]?.(op) ?? [];
      if (op.op === "createItem") return { id: `${op.collection}-new`, ...op.data };
      return {};
    },
  }));
}

beforeAll(async () => {
  // Warm the heavy graph (MJML) outside any one test's clock — under a full
  // parallel suite the cold import alone can pass the 20s default.
  stubGlobals();
  await import("#core/server/api/email/send.post");
}, 120_000);

beforeEach(async () => {
  ops = [];
  ledger.length = 0;
  sent.length = 0;
  failLedger = false;
  session = { user: { id: ME, email: "me@example.com", first_name: "Morgan", last_name: "Lee" } };
  query = {};
  body = {};
  provisioned = true;
  adminOf = [ORG_A];
  grantOf = [ORG_A];
  reads = {};
  stubGlobals();
  (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();
});

const memberReads = () => ops.filter((o) => o.op === "readItems" && o.collection === "hoa_members");
const memberWrites = () => ops.filter((o) => o.op === "updateItem" && o.collection === "hoa_members");

describe("GET/PATCH /api/user/email-subscription — the session's own membership", () => {
  const get = async () => (await import("#core/server/api/user/email-subscription.get")).default as any;
  const patch = async () => (await import("#core/server/api/user/email-subscription.patch")).default as any;

  it("401s without a session", async () => {
    session = null;
    query = { organizationId: ORG_A };
    await expect((await get())({})).rejects.toMatchObject({ statusCode: 401 });
    body = { organizationId: ORG_A, communityOptOut: true };
    await expect((await patch())({})).rejects.toMatchObject({ statusCode: 401 });
  });

  it("reads only the session user's row in the org named", async () => {
    query = { organizationId: ORG_B };
    reads.hoa_members = () => [{ id: "m-me", email: "me@example.com", email_community_opt_out: true, email_bounced: false }];
    const res = await (await get())({});
    expect(memberReads()[0]!.query.filter).toEqual({
      user: { _eq: ME },
      organization: { _eq: ORG_B },
      status: { _eq: "active" },
    });
    expect(res).toMatchObject({ available: true, member: true, communityOptOut: true, bounced: false });
  });

  it("says member:false with no membership, and available:false before the fields exist", async () => {
    query = { organizationId: ORG_A };
    expect(await (await get())({})).toEqual({ available: true, member: false });
    provisioned = false;
    (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();
    expect(await (await get())({})).toEqual({ available: false });
    expect(memberReads()).toHaveLength(1); // the unprovisioned call read no member
  });

  it("PATCH writes the session user's row, and nothing in the body can name another", async () => {
    body = { organizationId: ORG_A, communityOptOut: true, memberId: "m-victim", userId: "user-victim" };
    reads.hoa_members = (op) => (op.query.filter.user._eq === ME ? [{ id: "m-me", email_community_opt_out: false }] : []);
    expect(await (await patch())({})).toEqual({ ok: true, communityOptOut: true });
    expect(memberReads()[0]!.query.filter).toMatchObject({ user: { _eq: ME }, organization: { _eq: ORG_A } });
    expect(memberWrites()).toHaveLength(1);
    expect(memberWrites()[0]).toMatchObject({ id: "m-me", data: { email_community_opt_out: true, email_community_opt_out_source: "link" } });
  });

  it("PATCH 404s with no membership, 400s a bad body, 503s before the fields exist", async () => {
    body = { organizationId: ORG_A, communityOptOut: false };
    await expect((await patch())({})).rejects.toMatchObject({ statusCode: 404 });
    body = { organizationId: ORG_A, communityOptOut: "no" };
    await expect((await patch())({})).rejects.toMatchObject({ statusCode: 400 });
    provisioned = false;
    (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();
    body = { organizationId: ORG_A, communityOptOut: true };
    await expect((await patch())({})).rejects.toMatchObject({ statusCode: 503 });
    expect(memberWrites()).toHaveLength(0);
  });
});

describe("/api/hoa/member-email-status — admins of the org only", () => {
  const get = async () => (await import("#core/server/api/hoa/member-email-status.get")).default as any;
  const post = async () => (await import("#core/server/api/hoa/member-email-status.post")).default as any;

  it("403s an admin of another org, before any read", async () => {
    query = { organizationId: ORG_B };
    await expect((await get())({})).rejects.toMatchObject({ statusCode: 403 });
    body = { organizationId: ORG_B, memberId: "m-1", clear: "bounced" };
    await expect((await post())({})).rejects.toMatchObject({ statusCode: 403 });
    expect(memberReads()).toHaveLength(0);
  });

  it("lists only held members of the org named", async () => {
    query = { organizationId: ORG_A };
    reads.hoa_members = () => [
      { id: "m-1", email_bounced: true, email_bounced_reason: "Invalid Address", email_community_opt_out: false },
    ];
    const res = await (await get())({});
    expect(memberReads()[0]!.query.filter).toEqual({
      organization: { _eq: ORG_A },
      _or: [{ email_bounced: { _eq: true } }, { email_community_opt_out: { _eq: true } }],
    });
    expect(res).toMatchObject({ available: true, members: [{ id: "m-1", bounced: true, bouncedReason: "Invalid Address", optedOut: false }] });
  });

  it("degrades to available:false before the fields exist", async () => {
    provisioned = false;
    query = { organizationId: ORG_A };
    expect(await (await get())({})).toEqual({ available: false, members: [] });
  });

  it("Clear can't reach a member of another org by id (404, no write)", async () => {
    body = { organizationId: ORG_A, memberId: "m-other-org", clear: "bounced" };
    reads.hoa_members = (op) => (op.query.filter.organization._eq === ORG_A && op.query.filter.id._eq === "m-1" ? [{ id: "m-1" }] : []);
    await expect((await post())({})).rejects.toMatchObject({ statusCode: 404 });
    expect(memberReads()[0]!.query.filter).toEqual({ id: { _eq: "m-other-org" }, organization: { _eq: ORG_A } });
    expect(memberWrites()).toHaveLength(0);
  });

  it("Clear on a bounce restores mail and writes a board-only ledger entry with the old reason", async () => {
    body = { organizationId: ORG_A, memberId: "m-1", clear: "bounced" };
    reads.hoa_members = () => [
      { id: "m-1", first_name: "Pat", last_name: "Doe", email: "pat@x.com", email_bounced: true, email_bounced_reason: "Invalid Address", email_bounced_at: "2026-10-01T00:00:00Z" },
    ];
    expect(await (await post())({})).toEqual({ ok: true, changed: true, recorded: true, recordError: null });
    expect(memberWrites()[0]).toMatchObject({ id: "m-1", data: { email_bounced: false, email_bounced_reason: null } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      organization: ORG_A,
      event_type: "member_email_status_cleared",
      visibility: "board",
      actor_user: ME,
      actor_name: "Morgan Lee",
      payload: { cleared: "bounced", previous_reason: "Invalid Address" },
    });
    expect(ledger[0].summary).toMatch(/Pat Doe/);
  });

  it("Clear on an opt-out resubscribes; a no-op writes nothing to the ledger; a ledger failure is reported", async () => {
    body = { organizationId: ORG_A, memberId: "m-1", clear: "opt_out" };
    reads.hoa_members = () => [{ id: "m-1", email_community_opt_out: false }];
    expect(await (await post())({})).toMatchObject({ changed: false });
    expect(ledger).toHaveLength(0);

    reads.hoa_members = () => [{ id: "m-1", email_community_opt_out: true, email_community_opt_out_source: "spam" }];
    failLedger = true;
    const res = await (await post())({});
    expect(res).toMatchObject({ changed: true, recorded: false });
    expect(res.recordError).toMatch(/ledger down/);
    expect(memberWrites()[0]!.data).toMatchObject({ email_community_opt_out: false });
  });
});

describe("POST /api/email/save — a scheduled email is a send", () => {
  const save = async () => (await import("#core/server/api/email/save.post")).default as any;
  const base = { organizationId: ORG_A, subject: "Hi", content: "<p>x</p>", emailType: "announcement" };

  it("403s without the communications grant on that org, before any write", async () => {
    body = { ...base, organizationId: ORG_B, status: "scheduled" };
    await expect((await save())({})).rejects.toMatchObject({ statusCode: 403 });
    expect(ops.filter((o) => o.op === "createItem")).toHaveLength(0);
  });

  it("refuses a newsletter saved as essential", async () => {
    body = { ...base, emailType: "newsletter", emailClass: "essential" };
    await expect((await save())({})).rejects.toMatchObject({ statusCode: 400, data: { code: "newsletter_not_essential" } });
  });

  it("refuses to schedule community mail from an org with no address, but saves the draft", async () => {
    reads.hoa_organizations = () => ({ id: ORG_A, name: "Oak Court", city: "Austin" });
    body = { ...base, status: "scheduled", scheduledAt: "2026-12-01T10:00:00Z" };
    await expect((await save())({})).rejects.toMatchObject({ statusCode: 400, data: { code: "sender_address_missing" } });
    expect(ops.filter((o) => o.op === "createItem")).toHaveLength(0);

    body = { ...base, status: "draft" };
    await (await save())({});
    const created = ops.find((o) => o.op === "createItem" && o.collection === "hoa_emails")!;
    expect(created.data.email_class).toBe("community");
  });

  it("leaves email_class off the write before the field exists", async () => {
    provisioned = false;
    body = { ...base, emailType: "notice" };
    await (await save())({});
    const created = ops.find((o) => o.op === "createItem" && o.collection === "hoa_emails")!;
    expect("email_class" in created.data).toBe(false);
  });
});

describe("POST /api/email/send — the class rules at the send", () => {
  const send = async () => (await import("#core/server/api/email/send.post")).default as any;
  const ORG_ROW = { id: ORG_A, name: "Oak Court", slug: "oak", street_address: "1 Elm St", city: "Austin", state: "TX", zip: "78701", settings: null };
  const audience = [
    { id: "m-ok", first_name: "Ok", email: "ok@x.com", unsubscribe_token: TOKEN },
    { id: "m-out", first_name: "Out", email: "out@x.com", email_community_opt_out: true, unsubscribe_token: TOKEN.replace("A", "B") },
    { id: "m-dead", first_name: "Dead", email: "dead@x.com", email_bounced: true },
  ];
  const base = {
    organizationId: ORG_A,
    subject: "News",
    content: "<p>Hello</p>",
    recipientIds: ["m-ok", "m-out", "m-dead"],
    includeBoardFooter: false,
  };

  beforeEach(() => {
    reads.hoa_organizations = () => ORG_ROW;
    reads.hoa_members = () => audience;
    reads.hoa_emails = () => [];
  });

  it("refuses community mail from an org with no address: 400 before any member is read or mailed", async () => {
    reads.hoa_organizations = () => ({ ...ORG_ROW, street_address: null });
    body = { ...base, emailType: "newsletter" };
    await expect((await send())({})).rejects.toMatchObject({ statusCode: 400, data: { code: "sender_address_missing" } });
    expect(memberReads()).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(ops.filter((o) => o.op === "createItem")).toHaveLength(0);
  });

  it("community: mails only the member in good standing, with List-Unsubscribe and the footer", async () => {
    body = { ...base, emailType: "announcement" };
    const res = await (await send())({});
    expect(sent.map((m) => m.to)).toEqual(["ok@x.com"]);
    expect(sent[0].headers).toEqual({
      "List-Unsubscribe": `<https://app.test/api/email/unsubscribe/one-click?token=${TOKEN}&e=hoa_emails-new>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(sent[0].html).toContain(`https://app.test/unsubscribe?token=${TOKEN}`);
    expect(sent[0].html).toContain("1 Elm St, Austin, TX 78701");
    expect(sent[0].text).toContain("Unsubscribe: https://app.test/unsubscribe?token=");
    expect(res.stats).toMatchObject({ total: 1, delivered: 1, suppressed: { bounced: 1, optedOut: 1 } });
    expect(res.emailClass).toBe("community");
    const created = ops.find((o) => o.op === "createItem" && o.collection === "hoa_emails")!;
    expect(created.data).toMatchObject({ email_class: "community", recipient_count: 1 });
  });

  it("essential: the opted-out member is mailed too, the bounced one is not, and no List-Unsubscribe", async () => {
    body = { ...base, emailType: "notice" };
    const res = await (await send())({});
    expect(sent.map((m) => m.to)).toEqual(["ok@x.com", "out@x.com"]);
    for (const m of sent) {
      expect(m.headers).toEqual({});
      expect(m.text).toContain("it cannot be unsubscribed");
    }
    expect(res.stats.suppressed).toEqual({ bounced: 1, optedOut: 0 });
  });

  it("a newsletter marked essential is refused", async () => {
    body = { ...base, emailType: "newsletter", emailClass: "essential" };
    await expect((await send())({})).rejects.toMatchObject({ statusCode: 400, data: { code: "newsletter_not_essential" } });
    expect(sent).toHaveLength(0);
  });

  it("400s, sending nothing, when every selected member is held back", async () => {
    reads.hoa_members = () => audience.slice(1);
    body = { ...base, emailType: "announcement" };
    await expect((await send())({})).rejects.toMatchObject({ statusCode: 400, data: { code: "all_recipients_suppressed" } });
    expect(sent).toHaveLength(0);
  });

  it("before the fields exist: reads no suppression fields, mails everyone, no header", async () => {
    provisioned = false;
    reads.hoa_members = () => audience.map(({ email_bounced, email_community_opt_out, unsubscribe_token, ...m }: any) => m);
    body = { ...base, emailType: "announcement" };
    await (await send())({});
    expect(memberReads()[0]!.query.fields).not.toContain("unsubscribe_token");
    expect(sent).toHaveLength(3);
    expect(sent.every((m) => Object.keys(m.headers).length === 0)).toBe(true);
    expect(sent[0].html).toContain("https://app.test/unsubscribe");
  });

  it("403s without the communications grant", async () => {
    grantOf = [];
    body = { ...base, emailType: "announcement" };
    await expect((await send())({})).rejects.toMatchObject({ statusCode: 403 });
    expect(sent).toHaveLength(0);
  });
});
