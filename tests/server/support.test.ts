/**
 * Platform support requests (operator console Phase 3): who may contact HOA
 * Connect about what, who sees each request, the roles stored on it, replies by
 * email, internal notes, and the entries HOA Connect raises itself. The real
 * routes on a MemoryDirectus; notifications are spies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({
  session: null as any,
  body: {} as any,
  params: {} as any,
  query: {} as any,
  notifyUsers: vi.fn(),
  notifyPlatform: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.mock("#core/server/utils/stripe", () => ({ getStripe: () => ({}), isStripeLiveMode: () => false }));
vi.mock("#core/server/utils/rate-limit", () => ({ rateLimit: () => true, clientIp: () => "127.0.0.1" }));
vi.mock("#core/server/utils/notify", () => ({ notifyUsers: h.notifyUsers }));
vi.mock("#core/server/utils/platform-notify", () => ({ notifyPlatform: h.notifyPlatform }));
vi.mock("#core/server/utils/sendgrid", () => ({ sendEmail: h.sendEmail }));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const access = await import("#core/shared/support/access");
const support = await import("#core/server/utils/support");
type Handler = (e: H3Event) => Promise<any>;
const r = {
  context: (await import("#core/server/api/support/context.get")).default as Handler,
  create: (await import("#core/server/api/support/requests.post")).default as Handler,
  list: (await import("#core/server/api/support/requests.get")).default as Handler,
  one: (await import("#core/server/api/support/requests/[id].get")).default as Handler,
  reply: (await import("#core/server/api/support/requests/[id]/messages.post")).default as Handler,
  opsList: (await import("#core/server/api/ops/support.get")).default as Handler,
  opsOne: (await import("#core/server/api/ops/support/[id].get")).default as Handler,
  opsUpdate: (await import("#core/server/api/ops/support/[id].post")).default as Handler,
  opsReply: (await import("#core/server/api/ops/support/[id]/messages.post")).default as Handler,
};

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app", support: "role-support", hoaAdmin: "role-admin", pm: "role-pm", member: "role-member" };
let db: MemoryDirectus;
const RELATED: Record<string, string> = { organization: "hoa_organizations", billing_account: "billing_accounts" };

const directusRequest = async (op: any) => {
  if (op.op === "readUsers") return db.all("directus_users", op.query.filter);
  if (op.op === "readItems") {
    const q = op.query ?? {};
    let rows = db.all(op.collection, q.filter).map((x) => ({ ...x }));
    const sort: string | undefined = q.sort?.[0];
    if (sort) {
      const desc = sort.startsWith("-");
      const f = desc ? sort.slice(1) : sort;
      rows.sort((a, b) => String(a[f] ?? "").localeCompare(String(b[f] ?? "")) * (desc ? -1 : 1));
    }
    if (typeof q.limit === "number" && q.limit >= 0) rows = rows.slice(0, q.limit);
    // Expand "organization.name"-style fields, as Directus does.
    for (const f of (q.fields ?? []) as string[]) {
      const [rel] = f.split(".");
      if (!f.includes(".") || !RELATED[rel!]) continue;
      for (const row of rows) if (typeof row[rel!] === "string") row[rel!] = db.one(RELATED[rel!]!, row[rel!]) ?? row[rel!];
    }
    return rows;
  }
  if (op.op === "createItem" && !op.data.date_created) op.data = { ...op.data, date_created: new Date(Date.now() + db.table(op.collection).length).toISOString() };
  return db.request(op);
};

function seed() {
  db = new MemoryDirectus({ support_requests: ["auto_key"] });
  db.seed("hoa_organizations", [
    { id: "harbor", name: "Harbor Court", slug: "harbor" },
    { id: "oak", name: "Oak Row", slug: "oak" },
  ]);
  db.seed("billing_accounts", [{ id: "acc-1", name: "Acme Management" }]);
  const users = ["admin", "admin-oak", "owner", "tenant", "officer", "pm", "pm-grant", "staff", "support", "agent", "viewer"];
  db.seed("directus_users", users.map((u) => ({ id: `u-${u}`, first_name: u, last_name: "Person", email: `${u}@example.test` })));
  const m = (id: string, user: string, org: string, role: string, over: Record<string, any> = {}) => ({ id, user, organization: org, role, status: "active", ...over });
  db.seed("hoa_members", [
    m("m-admin", "u-admin", "harbor", ROLE.hoaAdmin, { member_type: "owner" }),
    m("m-admin-oak", "u-admin-oak", "oak", ROLE.hoaAdmin),
    m("m-owner", "u-owner", "harbor", ROLE.member, { member_type: "owner" }),
    m("m-tenant", "u-tenant", "harbor", ROLE.member, { member_type: "tenant" }),
    m("m-officer", "u-officer", "harbor", ROLE.member, { member_type: "owner" }),
    m("m-pm", "u-pm", "harbor", ROLE.pm, { manager_permissions: { inquiries: true } }),
    m("m-pm-grant", "u-pm-grant", "harbor", ROLE.pm, { manager_permissions: { inquiries: true, contact_platform: true } }),
  ]);
  db.seed("hoa_board_members", [{ id: "b1", hoa_member: "m-officer", title: "president", status: "published", term_start: "2026-01-01", term_end: null }]);
  db.seed("billing_account_members", [
    { id: "bam-1", billing_account: "acc-1", user: "u-agent", role: "billing_admin" },
    { id: "bam-2", billing_account: "acc-1", user: "u-viewer", role: "viewer" },
  ]);
}

const as = (who: string | null, role = ROLE.member) => {
  h.session = who === null ? null : { user: { id: `u-${who}`, role } };
};
const call = (route: Handler, opts: { body?: any; params?: any; query?: any } = {}) => {
  h.body = opts.body ?? {};
  h.params = opts.params ?? {};
  h.query = opts.query ?? {};
  return route(event);
};
const ask = (over: Record<string, any> = {}) => ({ organizationId: "harbor", category: "bug", subject: "The dues page is blank", body: "It shows nothing after I sign in.", ...over });
const open = async (who: string, over: Record<string, any> = {}, role = ROLE.member) => {
  as(who, role);
  return call(r.create, { body: ask(over) });
};

beforeEach(() => {
  seed();
  for (const f of [h.notifyUsers, h.notifyPlatform, h.sendEmail]) {
    f.mockReset();
    f.mockResolvedValue(true);
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: {
      appUrl: "https://app.test",
      directusRoleAppAdmin: ROLE.appAdmin,
      directusRolePlatformSupport: ROLE.support,
      directusRoleHoaAdmin: ROLE.hoaAdmin,
      directusRolePropertyManager: ROLE.pm,
      directusRoleMember: ROLE.member,
    },
  }));
});

// ── The rules ───────────────────────────────────────────────────────────────

describe("support rules", () => {
  const roles = (over: Partial<import("#core/shared/support/access").SupportRoles>) => ({ ...access.NO_ROLES, boardTitles: [], managerGrants: [], ...over });

  it("lets each role raise what the plan says", () => {
    expect(access.supportCategoriesFor(roles({ membership: "hoa_admin" }))).toHaveLength(4);
    expect(access.supportCategoriesFor(roles({ membership: "member", boardTitles: ["treasurer"] }))).toHaveLength(4);
    expect(access.supportCategoriesFor(roles({ membership: "member", residency: "owner" }))).toEqual(["bug"]);
    expect(access.supportCategoriesFor(roles({ membership: "member", residency: "tenant" }))).toEqual(["bug"]);
    expect(access.supportCategoriesFor(roles({ membership: "property_manager", managerGrants: ["inquiries"] }))).toEqual([]);
    expect(access.supportCategoriesFor(roles({ membership: "property_manager", managerGrants: ["contact_platform"] }))).toHaveLength(4);
    expect(access.supportCategoriesFor(roles({ billingAccountRole: "billing_admin" }))).toHaveLength(4);
    expect(access.supportCategoriesFor(roles({ billingAccountRole: "viewer" }))).toEqual([]);
    expect(access.supportCategoriesFor(access.NO_ROLES)).toEqual([]);
  });

  it("sends members, not managers, to ask their community", () => {
    expect(access.canAskCommunity(roles({ membership: "member" }))).toBe(true);
    expect(access.canAskCommunity(roles({ membership: "hoa_admin" }))).toBe(true);
    expect(access.canAskCommunity(roles({ membership: "property_manager" }))).toBe(false);
  });
});

// ── Opening a request ───────────────────────────────────────────────────────

describe("POST /api/support/requests", () => {
  it("lets an owner or a tenant report an app problem, and nothing else", async () => {
    await expect(open("owner")).resolves.toMatchObject({ id: expect.any(String) });
    await expect(open("tenant")).resolves.toMatchObject({ id: expect.any(String) });
    await expect(open("owner", { category: "question" })).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("community") });
    await expect(open("tenant", { category: "billing" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("stores the asker's roles as they were", async () => {
    await open("tenant");
    await open("officer", { category: "billing" });
    await open("pm-grant", { category: "question" }, ROLE.pm);
    const byUser = Object.fromEntries(db.table("support_requests").map((x) => [x.requester, x.requester_roles]));
    expect(byUser["u-tenant"]).toMatchObject({ membership: "member", residency: "tenant", boardTitles: [] });
    expect(byUser["u-officer"]).toMatchObject({ membership: "member", residency: "owner", boardTitles: ["president"] });
    expect(byUser["u-pm-grant"]).toMatchObject({ membership: "property_manager", managerGrants: ["inquiries", "contact_platform"] });
    expect(db.table("support_requests")[0]).toMatchObject({ requester_name: "tenant Person", requester_email: "tenant@example.test", status: "new", source: "app" });
  });

  it("refuses a Property Manager without contact_platform, a billing viewer and a stranger", async () => {
    await expect(open("pm", {}, ROLE.pm)).rejects.toMatchObject({ statusCode: 403 });
    as("viewer");
    await expect(call(r.create, { body: ask({ organizationId: undefined, billingAccountId: "acc-1", category: "billing" }) })).rejects.toMatchObject({ statusCode: 403 });
    await expect(open("admin-oak", {}, ROLE.hoaAdmin)).rejects.toMatchObject({ statusCode: 403 });
    as(null);
    await expect(call(r.create, { body: ask() })).rejects.toMatchObject({ statusCode: 401 });
    expect(db.table("support_requests")).toEqual([]);
  });

  it("lets a billing account's admin ask about the account", async () => {
    as("agent");
    await call(r.create, { body: ask({ organizationId: undefined, billingAccountId: "acc-1", category: "billing" }) });
    expect(db.table("support_requests")[0]).toMatchObject({ organization: null, billing_account: "acc-1", requester_roles: { billingAccountRole: "billing_admin" } });
  });

  it("emails HOA Connect, and copies the HOA Admins when a resident reports a problem", async () => {
    const { id } = await open("owner");
    expect(h.notifyPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "[Something isn't working] The dues page is blank", link: { label: "Open in the support inbox", url: `https://app.test/ops/support/${id}` } })
    );
    expect(h.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "harbor", recipientUserIds: ["u-admin"], path: `/support/${id}`, category: "request" })
    );
    h.notifyUsers.mockClear();
    await open("officer", { category: "billing" });
    expect(h.notifyUsers).not.toHaveBeenCalled(); // a board officer isn't "a resident reporting"
  });
});

// ── Who sees what ───────────────────────────────────────────────────────────

describe("who sees a request", () => {
  let id: string;
  beforeEach(async () => {
    ({ id } = await open("owner"));
  });
  const view = (who: string, role = ROLE.member) => {
    as(who, role);
    return call(r.one, { params: { id } });
  };

  it("the requester, and every HOA Admin of that community", async () => {
    await expect(view("owner")).resolves.toMatchObject({ request: { mine: true, requester: "You" } });
    await expect(view("admin", ROLE.hoaAdmin)).resolves.toMatchObject({ request: { mine: false, requester: "owner Person" } });
  });

  it("not another resident, a board officer, a Property Manager or another community's admin", async () => {
    for (const [who, role] of [["tenant", ROLE.member], ["officer", ROLE.member], ["pm-grant", ROLE.pm], ["admin-oak", ROLE.hoaAdmin]] as const) {
      await expect(view(who, role), who).rejects.toMatchObject({ statusCode: 404 });
    }
  });

  it("HOA Connect staff, in the console only", async () => {
    await expect(view("staff", ROLE.appAdmin)).rejects.toMatchObject({ statusCode: 404 });
    for (const role of [ROLE.appAdmin, ROLE.support]) {
      as("staff", role);
      await expect(call(r.opsOne, { params: { id } })).resolves.toMatchObject({ request: { requester: { name: "owner Person", email: "owner@example.test" }, rolesLine: "Member · owner" } });
    }
    as("admin", ROLE.hoaAdmin);
    await expect(call(r.opsOne, { params: { id } })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lists your own, and your communities' for an HOA Admin", async () => {
    await open("officer", { category: "feature" });
    as("owner");
    expect((await call(r.list)).requests.map((x: any) => x.subject)).toEqual(["The dues page is blank"]);
    expect((await call(r.list, { query: { view: "community" } })).requests).toEqual([]);
    as("admin", ROLE.hoaAdmin);
    const community = await call(r.list, { query: { view: "community" } });
    expect(community.requests.map((x: any) => x.requester).sort()).toEqual(["officer Person", "owner Person"]);
    expect(community.requests[0].community).toBe("Harbor Court");
  });

  it("offers each person the right doors", async () => {
    as("owner");
    const owner = await call(r.context);
    expect(owner.communities).toEqual([expect.objectContaining({ id: "harbor", canAsk: true, categories: ["bug"], isAdmin: false })]);
    as("pm", ROLE.pm);
    expect((await call(r.context)).communities[0]).toMatchObject({ canAsk: false, categories: [] });
    as("agent");
    expect((await call(r.context)).accounts).toEqual([{ id: "acc-1", name: "Acme Management", categories: ["bug", "question", "billing", "feature"] }]);
  });
});

// ── Replies ─────────────────────────────────────────────────────────────────

describe("replies", () => {
  let id: string;
  beforeEach(async () => {
    ({ id } = await open("owner"));
    h.notifyUsers.mockClear();
    h.notifyPlatform.mockClear();
  });

  it("HOA Connect's reply reaches the requester by bell and email, and waits on them", async () => {
    as("staff", ROLE.support);
    await call(r.opsReply, { params: { id }, body: { body: "Fixed: try again now." } });
    expect(h.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserIds: ["u-owner"],
        subject: "HOA Connect replied: The dues page is blank",
        path: `/support/${id}`,
        email: expect.objectContaining({ cta: { label: "Reply or view the request", path: `/support/${id}` } }),
      })
    );
    expect(db.one("support_requests", id)).toMatchObject({ status: "waiting", last_message_by: "staff" });
    as("owner");
    expect((await call(r.one, { params: { id } })).messages.map((m: any) => [m.author, m.fromHoaConnect])).toEqual([
      ["You", false],
      ["staff Person (HOA Connect)", true],
    ]);
  });

  it("calls HOA Connect's reply HOA Connect, even to staff who asked it themselves", async () => {
    as("staff", ROLE.appAdmin);
    await call(r.opsReply, { params: { id }, body: { body: "On it." } });
    db.table("support_requests").find((x) => x.id === id)!.requester = "u-staff";
    const thread = await call(r.one, { params: { id } });
    expect(thread.messages.at(-1)).toMatchObject({ author: "staff Person (HOA Connect)", fromHoaConnect: true });
  });

  it("an internal note reaches no one and never leaves the console", async () => {
    as("staff", ROLE.appAdmin);
    await call(r.opsReply, { params: { id }, body: { body: "Same bug as Oak Row.", internal: true } });
    expect(h.notifyUsers).not.toHaveBeenCalled();
    expect(db.one("support_requests", id)!.status).toBe("new");
    expect((await call(r.opsOne, { params: { id } })).messages.map((m: any) => m.internal)).toEqual([false, true]);
    as("owner");
    const thread = await call(r.one, { params: { id } });
    expect(JSON.stringify(thread)).not.toContain("Oak Row");
  });

  it("the requester's or their HOA Admin's reply goes to HOA Connect and reopens it", async () => {
    as("staff", ROLE.appAdmin);
    await call(r.opsUpdate, { params: { id }, body: { status: "closed" } });
    expect(db.one("support_requests", id)).toMatchObject({ status: "closed", closed_at: expect.any(String) });
    as("owner");
    await call(r.reply, { params: { id }, body: { body: "Still blank for me." } });
    expect(h.notifyPlatform).toHaveBeenCalledWith(expect.objectContaining({ subject: "Re: The dues page is blank", body: "Still blank for me." }));
    expect(db.one("support_requests", id)).toMatchObject({ status: "open", closed_at: null });
    as("admin", ROLE.hoaAdmin);
    await call(r.reply, { params: { id }, body: { body: "Same here on my phone." } });
    expect(h.notifyPlatform).toHaveBeenLastCalledWith(expect.objectContaining({ rows: expect.arrayContaining([["From", "admin Person (HOA Admin)"]]) }));
    as("tenant");
    await expect(call(r.reply, { params: { id }, body: { body: "me too" } })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("emails a billing account's admin directly, with no community to ring a bell in", async () => {
    as("agent");
    const { id: acct } = await call(r.create, { body: ask({ organizationId: undefined, billingAccountId: "acc-1", category: "billing" }) });
    as("staff", ROLE.appAdmin);
    await call(r.opsReply, { params: { id: acct }, body: { body: "Your card was updated." } });
    expect(h.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "agent@example.test", subject: "HOA Connect replied: The dues page is blank" }));
  });
});

// ── The console inbox and automatic entries ─────────────────────────────────

describe("the support inbox", () => {
  it("refuses everyone but staff, and filters and counts", async () => {
    await open("owner");
    await open("officer", { category: "billing", subject: "Card declined" });
    as("admin", ROLE.hoaAdmin);
    await expect(call(r.opsList)).rejects.toMatchObject({ statusCode: 403 });
    as("staff", ROLE.support);
    const all = await call(r.opsList);
    expect(all.counts).toMatchObject({ new: 2 });
    expect(all.requests.every((x: any) => x.awaitingUs)).toBe(true);
    expect((await call(r.opsList, { query: { category: "billing" } })).requests.map((x: any) => x.subject)).toEqual(["Card declined"]);
    expect((await call(r.opsList, { query: { q: "dues" } })).requests).toHaveLength(1);
  });

  it("opens one automatic entry per cause, and never throws", async () => {
    const first = await support.openAutoSupportRequest({ autoKey: "payment_failed:in_1", category: "billing", subject: "Payment failed: Harbor Court", body: "Invoice in_1 failed.", organizationId: "harbor" });
    const again = await support.openAutoSupportRequest({ autoKey: "payment_failed:in_1", category: "billing", subject: "Payment failed: Harbor Court", body: "Invoice in_1 failed.", organizationId: "harbor" });
    expect(first).toMatchObject({ created: true });
    expect(again).toEqual({ id: first!.id, created: false });
    expect(db.table("support_requests")).toEqual([expect.objectContaining({ source: "auto", priority: "high", requester: null, auto_key: "payment_failed:in_1" })]);
    expect(h.notifyPlatform).toHaveBeenCalledTimes(1);
    vi.stubGlobal("getTypedDirectus", () => ({ request: async () => Promise.reject(new Error("no collection")) }));
    await expect(support.openAutoSupportRequest({ autoKey: "x", category: "bug", subject: "s", body: "b" })).resolves.toBeNull();
  });
});
