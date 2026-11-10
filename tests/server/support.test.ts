/**
 * Platform support requests (operator console Phase 3): who may contact HOA
 * Connect about what, who sees each request, the roles stored on it, replies by
 * email, internal notes, and the entries HOA Connect raises itself. The real
 * routes on a MemoryDirectus; notifications are spies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  multipart: null as any,
  headers: {} as Record<string, string>,
  assets: new Map<string, Uint8Array>(),
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
  upload: (await import("#core/server/api/support/attachments.post")).default as Handler,
  download: (await import("#core/server/api/support/attachments/[messageId]/[fileId].get")).default as Handler,
  assetProxy: (await import("#core/server/api/directus/assets/[id].get")).default as Handler,
  inbound: (await import("#core/server/api/support/inbound/[token].post")).default as Handler,
};
const attachments = await import("#core/server/utils/support-attachments");

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app", support: "role-support", hoaAdmin: "role-admin", pm: "role-pm", member: "role-member" };
let db: MemoryDirectus;
const RELATED: Record<string, string> = { organization: "hoa_organizations", billing_account: "billing_accounts" };

// directus_files as Directus keeps them: an upload is a row plus its bytes.
async function fileOp(op: any) {
  const files = db.table("directus_files");
  switch (op.op) {
    case "uploadFiles": {
      const form = op.data as FormData;
      const blob = form.get("file") as File;
      const id = crypto.randomUUID();
      h.assets.set(id, new Uint8Array(await blob.arrayBuffer()));
      const row = {
        id,
        title: form.get("title"),
        description: form.get("description"),
        folder: form.get("folder") ?? null,
        type: blob.type,
        filesize: blob.size,
        filename_download: blob.name,
        uploaded_on: new Date().toISOString(),
      };
      files.push(row);
      return row;
    }
    case "readFiles":
      return db.all("directus_files", op.query?.filter);
    case "readFile": {
      const row = db.one("directus_files", op.id);
      if (!row) throw Object.assign(new Error("forbidden"), { response: { status: 403 } });
      return row;
    }
    case "updateFiles":
      for (const row of files) if (op.keys.includes(row.id)) Object.assign(row, op.data);
      return null;
    case "readFolders":
      return db.all("directus_folders", op.query?.filter);
    case "deleteFiles": {
      const keep = files.filter((row) => !op.keys.includes(row.id));
      files.splice(0, files.length, ...keep);
      return null;
    }
    case "readAsset": {
      const bytes = h.assets.get(op.id);
      if (!bytes) throw new Error("no asset");
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  }
  return undefined;
}

const directusRequest = async (op: any) => {
  if (["uploadFiles", "readFiles", "readFile", "updateFiles", "readFolders", "readAsset", "deleteFiles"].includes(op.op)) return fileOp(op);
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
  // Requests have uuid keys in Directus; the emailed-reply address relies on it.
  if (op.op === "createItem" && op.collection === "support_requests" && !op.data.id) op.data = { ...op.data, id: crypto.randomUUID() };
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
  h.assets.clear();
  h.headers = {};
  h.multipart = null;
  attachments._resetSupportFolderCache();
  for (const f of [h.notifyUsers, h.notifyPlatform, h.sendEmail]) {
    f.mockReset();
    f.mockResolvedValue(true);
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("readMultipartFormData", async () => h.multipart);
  vi.stubGlobal("setResponseHeaders", (_e: unknown, headers: Record<string, string>) => Object.assign(h.headers, headers));
  vi.stubGlobal("requireUserSession", async () => {
    if (!h.session?.user) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return h.session;
  });
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

// ── Attachments (Session F) ─────────────────────────────────────────────────

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");
const upload = async (who: string, filename: string, data: Uint8Array = PNG, role = ROLE.member) => {
  as(who, role);
  h.multipart = [{ name: "file", filename, type: "application/octet-stream", data: Buffer.from(data) }];
  return call(r.upload);
};

describe("attachments", () => {
  it("stores an upload as the uploader's, in the support folder, after checking its type and size", async () => {
    db.seed("directus_folders", [{ id: "fold-support", name: "Support attachments", parent: null }]);
    const a = await upload("owner", "blank-page.png");
    expect(a).toMatchObject({ name: "blank-page.png", type: "image/png", size: PNG.byteLength });
    expect(db.one("directus_files", a.id)).toMatchObject({ description: "support-upload:u-owner", folder: "fold-support" });

    await expect(upload("owner", "page.png", new TextEncoder().encode("<html><script>"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(upload("owner", "tool.exe", PNG)).rejects.toMatchObject({ statusCode: 400 });
    await expect(upload("owner", "huge.png", new Uint8Array(4 * 1024 * 1024 + 1))).rejects.toMatchObject({ statusCode: 413 });
    expect(await upload("owner", "report.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toMatchObject({ type: expect.stringContaining("wordprocessingml") });
    as(null);
    h.multipart = [{ name: "file", filename: "a.png", data: Buffer.from(PNG) }];
    await expect(call(r.upload)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("a message carries only its author's own fresh, unattached uploads, and says so in the email", async () => {
    const a = await upload("owner", "blank-page.png");
    const { id } = await open("owner", { attachmentIds: [a.id] });
    const [first] = db.all("support_messages", { request: { _eq: id } });
    expect(first!.attachments).toEqual([{ id: a.id, name: "blank-page.png", type: "image/png", size: PNG.byteLength }]);
    expect(db.one("directus_files", a.id)!.description).toBe(`support-message:${first!.id}`);
    expect(h.notifyPlatform).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("1 attachment: open the request to see it.") }));

    // Already on a message: not again.
    await expect(call(r.reply, { params: { id }, body: { body: "Again", attachmentIds: [a.id] } })).rejects.toMatchObject({ statusCode: 400 });
    // Someone else's upload: refused, and nothing written.
    const b = await upload("tenant", "mine.png");
    const before = db.table("support_messages").length;
    as("owner");
    await expect(call(r.reply, { params: { id }, body: { body: "Theirs", attachmentIds: [b.id] } })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.table("support_messages").length).toBe(before);
    // Stale: uploaded more than a day ago.
    const c = await upload("owner", "old.png");
    db.one("directus_files", c.id)!.uploaded_on = new Date(Date.now() - 25 * 3_600_000).toISOString();
    await expect(call(r.reply, { params: { id }, body: { body: "Old", attachmentIds: [c.id] } })).rejects.toMatchObject({ statusCode: 400 });
    // Six at once.
    const six = Array.from({ length: 6 }, () => crypto.randomUUID());
    await expect(call(r.reply, { params: { id }, body: { body: "Lots", attachmentIds: six } })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("a reply may be attachments alone; the requester's email names them, not the files", async () => {
    const { id } = await open("owner");
    const pdf = await upload("staff", "steps.pdf", PDF, ROLE.support);
    await call(r.opsReply, { params: { id }, body: { attachmentIds: [pdf.id] } });
    expect(h.notifyUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: expect.objectContaining({ bodyHtml: expect.stringContaining("1 attachment: open the request to see it.") }) })
    );
    as("owner");
    await expect(call(r.reply, { params: { id }, body: { body: "  " } })).rejects.toMatchObject({ statusCode: 400 });
    const thread = await call(r.one, { params: { id } });
    const last = thread.messages.at(-1);
    expect(last.attachments).toEqual([expect.objectContaining({ id: pdf.id, name: "steps.pdf", url: `/api/support/attachments/${last.id}/${pdf.id}` })]);
  });

  it("downloads only for those who may see the message; internal notes' files are staff only", async () => {
    const a = await upload("owner", "blank-page.png");
    const { id } = await open("owner", { attachmentIds: [a.id] });
    const msg = db.all("support_messages", { request: { _eq: id } })[0]!.id;
    const get = (who: string, role = ROLE.member, fileId = a.id, messageId = msg) => {
      as(who, role);
      return call(r.download, { params: { messageId, fileId } });
    };

    const bytes = await get("owner");
    expect([...bytes]).toEqual([...PNG]);
    expect(h.headers).toMatchObject({
      "Content-Type": "image/png",
      "Content-Disposition": expect.stringMatching(/^inline; filename="blank-page.png"/),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    });
    await expect(get("admin", ROLE.hoaAdmin)).resolves.toBeTruthy();
    await expect(get("staff", ROLE.support)).resolves.toBeTruthy();
    for (const [who, role] of [["tenant", ROLE.member], ["officer", ROLE.member], ["pm-grant", ROLE.pm], ["admin-oak", ROLE.hoaAdmin]] as const) {
      await expect(get(who, role)).rejects.toMatchObject({ statusCode: 404 });
    }
    // A file that isn't on this message, even one the viewer may see elsewhere.
    const other = await upload("owner", "other.png");
    await expect(get("owner", ROLE.member, other.id)).rejects.toMatchObject({ statusCode: 404 });

    // An internal note's file: staff only, even for the requester.
    const note = await upload("staff", "trace.txt", new TextEncoder().encode("stack trace"), ROLE.appAdmin);
    const { id: noteId } = await call(r.opsReply, { params: { id }, body: { body: "Same as Oak Row.", internal: true, attachmentIds: [note.id] } });
    await expect(get("owner", ROLE.member, note.id, noteId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(get("admin", ROLE.hoaAdmin, note.id, noteId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(get("support", ROLE.support, note.id, noteId)).resolves.toBeTruthy();
    expect(h.headers["Content-Disposition"]).toMatch(/^attachment; filename="trace.txt"/);
    expect(h.headers["Content-Type"]).toBe("text/plain; charset=utf-8");
  });

  it("the general asset proxy refuses support files, images included", async () => {
    const a = await upload("owner", "blank-page.png");
    as("admin", ROLE.hoaAdmin);
    await expect(call(r.assetProxy, { params: { id: a.id } })).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── Replies by email (Session G) ────────────────────────────────────────────

const inbound = await import("#core/server/utils/support-inbound");
const shared = await import("#core/shared/support/inbound");
const supportReply = await import("#core/server/utils/support-reply");

describe("replies by email", () => {
  const TOKEN = "inbound-token-0123456789abcdef";
  const enc = new TextEncoder();
  let id: string;

  type Mail = { to: string; from: string; text?: string; html?: string; headers?: string; files?: Array<{ name: string; data: Uint8Array; cid?: boolean }> };
  const parts = (m: Mail) => {
    const files = m.files ?? [];
    const info = Object.fromEntries(files.map((f, i) => [`attachment${i + 1}`, { filename: f.name, type: "application/octet-stream", ...(f.cid ? { "content-id": `ii_${i}` } : {}) }]));
    return [
      { name: "headers", data: Buffer.from(m.headers ?? "Message-ID: <a1@mail.test>\nFrom: x\n") },
      { name: "from", data: Buffer.from(m.from) },
      { name: "to", data: Buffer.from(m.to) },
      { name: "envelope", data: Buffer.from(JSON.stringify({ to: [m.to.replace(/^.*<|>.*$/g, "")], from: "bounce@mail.test" })) },
      { name: "subject", data: Buffer.from("Re: HOA Connect replied") },
      { name: "text", data: Buffer.from(m.text ?? "") },
      ...(m.html ? [{ name: "html", data: Buffer.from(m.html) }] : []),
      { name: "charsets", data: Buffer.from(JSON.stringify({ to: "UTF-8", from: "UTF-8", text: "utf-8", html: "utf-8" })) },
      { name: "attachments", data: Buffer.from(String(files.length)) },
      { name: "attachment-info", data: Buffer.from(JSON.stringify(info)) },
      ...files.map((f, i) => ({ name: `attachment${i + 1}`, filename: f.name, type: "application/octet-stream", data: Buffer.from(f.data) })),
    ];
  };
  const post = (m: Mail, token = TOKEN) => {
    h.multipart = parts(m);
    return call(r.inbound, { params: { token } });
  };
  const receive = (m: Mail) => inbound.receiveSupportEmail(inbound.parseSendGridInbound(parts(m) as any));
  /** The Reply-To the last support email gave this person. */
  const replyAddressFor = (userId: string) => h.notifyUsers.mock.calls.at(-1)![0].email.replyToFor(userId)?.email as string;
  const messages = () => db.all("support_messages", { request: { _eq: id } });
  const GMAIL = (reply: string) =>
    `${reply}\n\nOn Tue, Nov 10, 2026 at 3:04 PM HOA Connect <notifications@hoaconnect.info>\nwrote:\n\n> Fixed: try again now.\n>\n`;

  beforeEach(async () => {
    process.env.SUPPORT_REPLY_SECRET = "test-reply-secret";
    process.env.SUPPORT_INBOUND_TOKEN = TOKEN;
    vi.spyOn(console, "info").mockImplementation(() => {});
    ({ id } = await open("owner"));
    as("staff", ROLE.support);
    await call(r.opsReply, { params: { id }, body: { body: "Fixed: try again now." } });
    h.notifyPlatform.mockClear();
  });
  afterEach(() => {
    delete process.env.SUPPORT_REPLY_SECRET;
    delete process.env.SUPPORT_INBOUND_TOKEN;
  });

  it("support emails carry a Reply-To signed for each recipient, and none while the secret is unset", async () => {
    const owner = replyAddressFor("u-owner");
    expect(owner).toMatch(new RegExp(`^support\\+${id}\\.[0-9a-f]{16}@reply\\.hoaconnect\\.info$`));
    expect(owner.split("@")[0]!.length).toBeLessThanOrEqual(64);
    expect(replyAddressFor("u-tenant")).not.toBe(owner);

    // The HOA Admins copied on a resident's report get their own.
    await open("tenant", { subject: "Can't upload" });
    const copy = h.notifyUsers.mock.calls.at(-1)![0];
    expect(copy.subject).toBe("A resident reported a problem with the app");
    expect(copy.email.replyToFor("u-admin").email).toMatch(/^support\+[0-9a-f-]{36}\.[0-9a-f]{16}@reply\.hoaconnect\.info$/);

    // An agency's request is emailed directly, with the same address.
    as("agent");
    const { id: acct } = await call(r.create, { body: ask({ organizationId: undefined, billingAccountId: "acc-1", category: "billing" }) });
    as("staff", ROLE.appAdmin);
    await call(r.opsReply, { params: { id: acct }, body: { body: "Your card was updated." } });
    expect(h.sendEmail.mock.calls.at(-1)![0].replyTo).toEqual({ email: expect.stringContaining(`support+${acct}.`), name: "HOA Connect Support" });

    delete process.env.SUPPORT_REPLY_SECRET;
    expect(replyAddressFor("u-owner")).toBeUndefined();
    expect(await receive({ to: owner, from: "owner@example.test", text: "hi" })).toEqual({ outcome: "not-configured" });
  });

  it("a good reply lands in the thread without the quoted email, and reopens a closed request", async () => {
    const to = replyAddressFor("u-owner");
    await call(r.opsUpdate, { params: { id }, body: { status: "closed" } });
    expect(db.one("support_requests", id)!.status).toBe("closed");

    await expect(post({ to: `HOA Connect Support <${to.toUpperCase()}>`, from: '"Owner Person" <Owner@Example.test>', text: GMAIL("Still blank for me.\n\nSent from my iPhone") })).resolves.toEqual({ ok: true });
    expect(messages().at(-1)).toMatchObject({ author: "u-owner", author_kind: "requester", body: "Still blank for me.", internal: false });
    expect(db.one("support_requests", id)).toMatchObject({ status: "open", closed_at: null, last_message_by: "requester" });
    expect(h.notifyPlatform).toHaveBeenCalledWith(expect.objectContaining({ subject: "Re: The dues page is blank", body: "Still blank for me." }));
  });

  it("an HOA Admin copied on the request replies as the HOA Admin", async () => {
    const to = replyAddressFor("u-admin");
    expect(await receive({ to, from: "admin@example.test", text: "Same here on my phone." })).toMatchObject({ outcome: "posted" });
    expect(messages().at(-1)).toMatchObject({ author: "u-admin", author_kind: "admin" });
    // Once they're no longer its admin, their old address does nothing.
    db.table("hoa_members").find((m) => m.id === "m-admin")!.status = "inactive";
    expect(await receive({ to, from: "admin@example.test", text: "Again" })).toEqual({ outcome: "bad-signature" });
  });

  it("refuses a bad signature, another sender, an auto-reply and a stranger's request, answering 200 to each", async () => {
    const to = replyAddressFor("u-owner");
    const before = messages().length;
    const forged = to.replace(/\.([0-9a-f]{16})@/, (_m, s: string) => `.${s.slice(0, 15)}${s.endsWith("0") ? "1" : "0"}@`);
    expect(await receive({ to: forged, from: "owner@example.test", text: "x" })).toEqual({ outcome: "bad-signature" });
    // The tenant's own address can't be pointed at the owner's request.
    expect(await receive({ to: to.replace(/\.[0-9a-f]{16}@/, `.${supportReply.supportReplySignature(id, "u-tenant")}@`), from: "tenant@example.test", text: "x" })).toEqual({ outcome: "bad-signature" });
    expect(await receive({ to, from: "someone-else@example.test", text: "x" })).toEqual({ outcome: "wrong-sender" });
    expect(await receive({ to, from: "owner@example.test", text: "I'm away", headers: "Auto-Submitted: auto-replied\n" })).toEqual({ outcome: "auto-reply" });
    expect(await receive({ to: to.replace("reply.hoaconnect.info", "elsewhere.test"), from: "owner@example.test", text: "x" })).toEqual({ outcome: "no-address" });
    expect(await receive({ to: to.replace(id, crypto.randomUUID()), from: "owner@example.test", text: "x" })).toEqual({ outcome: "unknown-request" });
    expect(await receive({ to, from: "owner@example.test", text: GMAIL("") })).toEqual({ outcome: "empty" });
    await expect(post({ to, from: "someone-else@example.test", text: "x" })).resolves.toEqual({ ok: true });
    expect(messages().length).toBe(before);

    // Not SendGrid (or a misconfiguration): a wrong token is 404, not 200.
    await expect(post({ to, from: "owner@example.test", text: "x" }, "wrong-token-0123456789abcd")).rejects.toMatchObject({ statusCode: 404 });
    delete process.env.SUPPORT_INBOUND_TOKEN;
    await expect(post({ to, from: "owner@example.test", text: "x" }, "")).rejects.toMatchObject({ statusCode: 404 });
    expect(messages().length).toBe(before);
  });

  it("SendGrid posting the same email twice adds one message", async () => {
    const to = replyAddressFor("u-owner");
    const mail = { to, from: "owner@example.test", text: GMAIL("It works now, thanks."), files: [{ name: "proof.png", data: PNG }] };
    await post(mail);
    await post(mail);
    expect(messages().filter((m) => m.body === "It works now, thanks.")).toHaveLength(1);
    expect(h.notifyPlatform).toHaveBeenCalledTimes(1);
    // Nothing stored for the repeat either.
    expect(db.all("directus_files", { title: { _eq: "proof.png" } })).toHaveLength(1);
  });

  it("emailed attachments follow Session F's rules; what's left off is named on the message", async () => {
    db.seed("directus_folders", [{ id: "fold-support", name: "Support attachments", parent: null }]);
    const to = replyAddressFor("u-owner");
    const files = [
      { name: "logo.png", data: PNG, cid: true }, // a signature logo: skipped quietly
      { name: "screen.png", data: PNG },
      { name: "steps.pdf", data: PDF },
      { name: "tool.zip", data: new Uint8Array([0x50, 0x4b, 3, 4]) },
      { name: "fake.png", data: enc.encode("<html>") },
      ...Array.from({ length: 4 }, (_, i) => ({ name: `more-${i}.png`, data: PNG })),
    ];
    expect(await receive({ to, from: "owner@example.test", text: "Screens attached.", files })).toMatchObject({ outcome: "posted" });
    const last = messages().at(-1)!;
    expect(last.attachments.map((a: any) => a.name)).toEqual(["screen.png", "steps.pdf", "more-0.png", "more-1.png", "more-2.png"]);
    expect(last.body).toMatch(/^Screens attached\.\n\n\(Not attached from the email: tool\.zip: only images.*fake\.png isn't the kind of file its name says\. more-3\.png: only 5 files fit on one message\.\)$/s);
    for (const a of last.attachments) expect(db.one("directus_files", a.id)).toMatchObject({ description: `support-message:${last.id}`, folder: "fold-support" });
    expect(db.all("directus_files", { title: { _eq: "logo.png" } })).toHaveLength(0);
    // A file alone is a reply.
    expect(await receive({ to, from: "owner@example.test", text: GMAIL(""), files: [{ name: "again.pdf", data: PDF }] })).toMatchObject({ outcome: "posted" });
  });

  it("cuts the quoted history the common mail apps add", () => {
    const strip = shared.stripQuotedReply;
    expect(strip("Thanks!\n\nOn Tue, Nov 10, 2026, 3:04 PM HOA Connect <n@hoaconnect.info> wrote:\n> old")).toBe("Thanks!");
    expect(strip(GMAIL("Two lines\nof reply"))).toBe("Two lines\nof reply");
    expect(strip("Done.\r\n\r\nFrom: HOA Connect <n@hoaconnect.info>\r\nSent: Tuesday, November 10, 2026 3:04 PM\r\nTo: Owner\r\nSubject: x")).toBe("Done.");
    expect(strip("Done.\n\n-----Original Message-----\nFrom: x")).toBe("Done.");
    expect(strip("Done.\n________________________________\nFrom: x")).toBe("Done.");
    expect(strip("Yes.\n> quoted\nNo.")).toBe("Yes.\nNo.");
    expect(strip("Body\n-- \nJane Owner\n555-0100")).toBe("Body");
    expect(strip("Body\n\nGet Outlook for iOS")).toBe("Body");
    expect(shared.stripQuotedReply(shared.htmlToText('<div>Hi &amp; thanks<br>Jane</div><div class="gmail_quote">On … wrote:<blockquote>old</blockquote></div>'))).toBe("Hi & thanks\nJane");
    expect(shared.emailAddressOf('"Jane, Owner" <Jane@Example.test>')).toBe("jane@example.test");
    expect(shared.isAutoReply("Auto-Submitted: no\n")).toBe(false);
    expect(shared.isAutoReply("Precedence: bulk\n")).toBe(true);
  });
});

// ── Sweeping uploads no message claimed ─────────────────────────────────────

const sweep = (await import("#core/server/api/support/attachments/sweep")).default as Handler;
const { _resetJobHeartbeat } = await import("#core/server/utils/job-heartbeat");
const { OPS_JOBS } = await import("#core/shared/ops/jobs");
const vercelCrons = (await import("../../vercel.json")).default.crons as Array<{ path: string; schedule: string }>;

describe("the unattached-upload sweep", () => {
  const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const file = (id: string, description: string, folder: string | null, age: number) => ({ id, title: `${id}.png`, description, folder, uploaded_on: days(age) });
  const left = () => db.table("directus_files").map((f) => f.id).sort();

  beforeEach(() => {
    _resetJobHeartbeat();
    db.seed("directus_folders", [{ id: "fold-support", name: "Support attachments", parent: null }]);
    db.seed("directus_files", [
      file("stale", "support-upload:u-owner", "fold-support", 8),
      file("stale-2", "support-upload:u-staff", "fold-support", 30),
      file("fresh", "support-upload:u-owner", "fold-support", 6),
      file("attached-old", "support-message:msg-1", "fold-support", 90),
      file("outside", "support-upload:u-owner", null, 30),
      file("other-folder", "support-upload:u-owner", "fold-photos", 30),
      file("community-photo", "Pool opening", "fold-support", 30),
      file("no-description", null as any, "fold-support", 30),
    ]);
  });

  it("deletes only the folder's uploads still waiting after 7 days; a dry run deletes nothing", async () => {
    const all = left();
    as("staff", ROLE.appAdmin);
    expect(await call(sweep, { query: { dry: "1" } })).toMatchObject({ dry: true, folder: true, found: 2, deleted: 0 });
    expect(left()).toEqual(all);
    expect(db.all("ops_job_heartbeats", { id: { _eq: "support-uploads-sweep" } })).toHaveLength(0);

    expect(await call(sweep)).toMatchObject({ dry: false, found: 2, deleted: 2 });
    expect(left()).toEqual(["attached-old", "community-photo", "fresh", "no-description", "other-folder", "outside"]);
    expect(db.one("ops_job_heartbeats", "support-uploads-sweep")).toMatchObject({ last_status: "ok", last_summary: { found: 2, deleted: 2, folder: true } });
    expect(await call(sweep)).toMatchObject({ found: 0, deleted: 0 });
  });

  it("never touches attached files, even if a filter let one through, and does nothing without the folder", async () => {
    // A Directus that ignored the filter: the row checks still hold.
    vi.stubGlobal("getTypedDirectus", () => ({
      request: async (op: any) => (op.op === "readFiles" ? db.table("directus_files").map((f) => ({ ...f })) : directusRequest(op)),
    }));
    expect(await attachments.sweepUnattachedSupportUploads({ dry: false })).toMatchObject({ found: 2, deleted: 2 });
    expect(left()).toContain("attached-old");
    expect(left()).toContain("outside");

    seed();
    attachments._resetSupportFolderCache();
    db.seed("directus_files", [file("stale", "support-upload:u-owner", null, 30)]);
    expect(await attachments.sweepUnattachedSupportUploads({ dry: false })).toMatchObject({ folder: false, found: 0, deleted: 0 });
    expect(left()).toEqual(["stale"]);
  });

  it("refuses a stray caller, and is a scheduled job the health page knows", async () => {
    as("admin", ROLE.hoaAdmin);
    await expect(call(sweep)).rejects.toMatchObject({ statusCode: 403 });
    as(null);
    await expect(call(sweep)).rejects.toMatchObject({ statusCode: 401 });
    expect(db.table("directus_files")).toHaveLength(8);

    for (const job of OPS_JOBS.filter((j) => j.runner === "vercel")) expect(vercelCrons).toContainEqual({ path: job.source, schedule: job.schedule });
    expect(vercelCrons).toHaveLength(OPS_JOBS.filter((j) => j.runner === "vercel").length);
  });
});
