/**
 * Settings → Reminders' routes and the request-status event (Earnest parity
 * round 3, Phase 5b): the gate, who approved a rule (the server, from the
 * session — never the form), the 24-hour dry run, "send me a test", and the
 * status event's trust model.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReminderSnapshot } from "#core/shared/reminders/rules";
import { resolveReminderSettings } from "#core/shared/reminders/settings";

// Untyped fakes for the SDK builders: a command is just what it was asked.
vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ cmd: "readItems", collection, query }),
  readItem: (collection: string, id: string, query: any) => ({ cmd: "readItem", collection, id, query }),
  createItem: (collection: string, data: any) => ({ cmd: "createItem", collection, data }),
  updateItem: (collection: string, id: string, data: any) => ({ cmd: "updateItem", collection, id, data }),
}));

const h = vi.hoisted(() => ({
  schema: true,
  storeOpts: null as unknown,
  store: null as any,
  sends: [] as any[],
}));

vi.mock("#core/server/utils/reminders", async (orig) => {
  const mod = (await orig()) as any;
  return {
    ...mod,
    reminderSchema: async () => h.schema,
    directusReminderStore: (_d: unknown, opts: unknown) => {
      h.storeOpts = opts;
      return h.store;
    },
    sendReminder: async (org: any, c: any) => {
      h.sends.push({ org, composed: c });
      return { bell: 1, push: 1, email: 1 };
    },
  };
});

const ORG = "11111111-1111-4111-8111-111111111111";
const ADMIN = "user-admin";

let body: any;
let rows: Record<string, any[]>;
let writes: any[];
let grants: Array<{ orgId: string; key: string }>;
let denied: boolean;
let session: any;
let notified: any[];
let member: boolean;

beforeAll(() => {
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.statusMessage || o.message), o));
  vi.stubGlobal("requireUserSession", async () => session);
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: session?.user?.id }));
  vi.stubGlobal("resolveOrgId", async (i: any) => String(i.orgId ?? "").trim());
  vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, orgId: string, key: string) => {
    grants.push({ orgId, key });
    if (denied) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    return { via: "admin" };
  });
  // The real gate, as Nitro would auto-import it.
  vi.stubGlobal("requireReminderAdmin", (...a: unknown[]) =>
    import("#core/server/utils/reminder-admin").then((m) => (m.requireReminderAdmin as (...x: unknown[]) => unknown)(...a))
  );
  vi.stubGlobal("checkMembership", async () => ({ isMember: member }));
  vi.stubGlobal("notifyReminderEvent", async (...args: unknown[]) => {
    notified.push(args);
    return { recipients: 1, sent: 1, skipped: 0, lost: 0, failed: 0 };
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (cmd: any) => {
      if (cmd.cmd === "readItems") return rows[cmd.collection] ?? [];
      if (cmd.cmd === "readItem") return (rows[cmd.collection] ?? []).find((r) => r.id === cmd.id) ?? null;
      writes.push(cmd);
      return cmd.cmd === "createItem" ? { id: "settings-new" } : {};
    },
  }));
});

beforeEach(() => {
  body = { orgId: ORG };
  rows = { hoa_organizations: [{ id: ORG, timezone: "America/New_York", settings: { id: "settings-1", reminders: null } }] };
  writes = [];
  grants = [];
  denied = false;
  member = true;
  notified = [];
  session = { user: { id: ADMIN, email: "admin@demo.test" } };
  h.schema = true;
  h.sends = [];
  h.store = null;
});

const call = async (path: string) => ((await import(path)).default as (e: unknown) => Promise<any>)({});

describe("the gate", () => {
  const requireReminderAdmin = (...a: unknown[]) =>
    import("#core/server/utils/reminder-admin").then((m) => (m.requireReminderAdmin as (...x: unknown[]) => Promise<any>)(...a));

  it("asks for the communications grant on this org, the way preview-mjml does", async () => {
    expect(await requireReminderAdmin({}, { orgId: ORG })).toEqual({ orgId: ORG, userId: ADMIN, email: "admin@demo.test" });
    expect(grants).toEqual([{ orgId: ORG, key: "communications" }]);
  });

  it("refuses a caller without it, and a call with no community", async () => {
    denied = true;
    await expect(requireReminderAdmin({}, { orgId: ORG })).rejects.toMatchObject({ statusCode: 403 });
    denied = false;
    await expect(requireReminderAdmin({}, {})).rejects.toMatchObject({ statusCode: 400 });
  });

  it("every route is behind it", async () => {
    denied = true;
    for (const path of ["settings.put", "dry-run.post", "test.post"]) {
      body = { orgId: ORG, template: "reminder-dues" };
      await expect(call(`#core/server/api/org/reminders/${path}`)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(writes).toEqual([]);
    expect(h.sends).toEqual([]);
  });
});

describe("PUT /api/org/reminders/settings", () => {
  const put = () => call("#core/server/api/org/reminders/settings.put");

  it("stores the rules and stamps who approved them — from the session, whatever the form claims", async () => {
    body = { orgId: ORG, send_hour: 10, rules: { dues: { enabled: true, days: 5, approved_by: "someone-else", approved_at: "2020-01-01T00:00:00Z" } } };
    const res = await put();
    const update = writes.find((w) => w.cmd === "updateItem" && w.collection === "block_settings");
    expect(update.id).toBe("settings-1");
    expect(update.data.reminders.send_hour).toBe(10);
    expect(update.data.reminders.rules.dues).toMatchObject({ enabled: true, days: 5, approved_by: ADMIN });
    expect(update.data.reminders.rules.dues.approved_at).not.toBe("2020-01-01T00:00:00Z");
    expect(update.data.reminders.rules.meeting.enabled).toBe(false);
    expect(res.resolved.rules.dues.enabled).toBe(true);
  });

  it("keeps an earlier approval when the rule is saved again unchanged", async () => {
    rows.hoa_organizations[0].settings.reminders = { rules: { dues: { enabled: true, approved_at: "2026-10-01T00:00:00.000Z", approved_by: "board-chair" } } };
    body = { orgId: ORG, send_hour: 11, rules: { dues: { enabled: true } } };
    await put();
    const update = writes.find((w) => w.collection === "block_settings");
    expect(update.data.reminders.rules.dues).toMatchObject({ approved_at: "2026-10-01T00:00:00.000Z", approved_by: "board-chair" });
  });

  it("creates the settings row, and links it, for a community that has none", async () => {
    rows.hoa_organizations[0].settings = null;
    body = { orgId: ORG, rules: { poll: { enabled: true } } };
    await put();
    expect(writes[0]).toMatchObject({ cmd: "createItem", collection: "block_settings" });
    expect(writes[1]).toMatchObject({ cmd: "updateItem", collection: "hoa_organizations", id: ORG, data: { settings: "settings-new" } });
  });

  it("changes the time zone only when it is a real, different one", async () => {
    body = { orgId: ORG, timezone: "America/Los_Angeles" };
    expect((await put()).timezone).toBe("America/Los_Angeles");
    expect(writes.find((w) => w.collection === "hoa_organizations")?.data).toEqual({ timezone: "America/Los_Angeles" });

    writes = [];
    body = { orgId: ORG, timezone: "America/New_York" };
    await put();
    expect(writes.find((w) => w.collection === "hoa_organizations")).toBeUndefined();

    writes = [];
    body = { orgId: ORG, timezone: "Mars/Olympus" };
    await expect(put()).rejects.toMatchObject({ statusCode: 400 });
    expect(writes).toEqual([]);
  });

  it("before pnpm create:reminder-log: 409 and nothing written", async () => {
    h.schema = false;
    await expect(put()).rejects.toMatchObject({ statusCode: 409 });
    expect(writes).toEqual([]);
  });

  it("404 for a community that isn't there", async () => {
    rows.hoa_organizations = [];
    await expect(put()).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("POST /api/org/reminders/dry-run", () => {
  const now = Date.parse("2026-11-03T14:30:00Z");
  const closing = (hourly: { pollCloses: string }): ReminderSnapshot => ({
    org: { id: ORG, slug: "demo", name: "Demo HOA", timeZone: "America/New_York", graceDays: 5 },
    settings: resolveReminderSettings({ rules: { poll: { enabled: true } } }),
    charges: [],
    meetings: [],
    requests: [],
    polls: [
      {
        id: "p1",
        question: "Repaint the fence?",
        status: "open",
        createdAt: "2026-10-27T14:00:00Z",
        closesAt: hourly.pollCloses,
        audienceUserIds: ["u1", "u2", "u3"],
        voterUserIds: ["u1"],
      },
    ],
    vendors: [],
    adminUserIds: [],
  });

  const fakeStore = (snap: ReminderSnapshot) => {
    const s = {
      loads: 0,
      keysAsked: 0,
      async listOrgs() {
        return [{ id: ORG, slug: "demo", name: "Demo HOA", timeZone: "America/New_York", graceDays: 5, reminders: { rules: { poll: { enabled: true } } } }];
      },
      async loadSnapshot() {
        s.loads++;
        return snap;
      },
      async existingKeys() {
        s.keysAsked++;
        return new Set<string>();
      },
      insertLogs: vi.fn(),
      insertLog: vi.fn(),
      settleLogs: vi.fn(),
      stampCharges: vi.fn(),
    };
    return s;
  };

  it("folds 24 hourly dry runs into one answer, reading the community once, writing nothing", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    try {
      h.store = fakeStore(closing({ pollCloses: "2026-11-04T13:00:00Z" }));
      const res = await call("#core/server/api/org/reminders/dry-run.post");
      expect(h.store.loads).toBe(1);
      // The key lookup happens only in the hours something is due (the poll's last day), never a write.
      expect(h.store.keysAsked).toBeGreaterThan(0);
      expect(h.store.keysAsked).toBeLessThanOrEqual(24);
      expect(h.store.insertLogs).not.toHaveBeenCalled();
      expect(h.store.insertLog).not.toHaveBeenCalled();
      expect(res).toMatchObject({ success: true, provisioned: true, hours: 24, timeZone: "America/New_York", total: 1, headline: "1 poll reminder" });
      expect(res.rules).toEqual([{ rule: "poll", label: "Polls", count: 1, recipients: 2 }]);
      expect(h.sends).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so when nothing is scheduled", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    try {
      h.store = fakeStore(closing({ pollCloses: "2026-12-30T13:00:00Z" }));
      const res = await call("#core/server/api/org/reminders/dry-run.post");
      expect(res.headline).toBe("Nothing is scheduled to go out in the next 24 hours.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("works before the script has run, unprovisioned", async () => {
    h.schema = false;
    h.store = fakeStore(closing({ pollCloses: "2026-12-30T13:00:00Z" }));
    const res = await call("#core/server/api/org/reminders/dry-run.post");
    expect(res.provisioned).toBe(false);
    expect(h.storeOpts).toEqual({ provisioned: false });
  });

  it("404 for a community that isn't there", async () => {
    h.store = { ...fakeStore(closing({ pollCloses: "2026-12-30T13:00:00Z" })), listOrgs: async () => [] };
    await expect(call("#core/server/api/org/reminders/dry-run.post")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("POST /api/org/reminders/test", () => {
  it("sends one sample to the signed-in admin and nobody else, marked [Test], never logged", async () => {
    rows.hoa_organizations = [{ id: ORG, slug: "demo", name: "Demo HOA", timezone: "America/Chicago" }];
    body = { orgId: ORG, template: "reminder-meeting" };
    const res = await call("#core/server/api/org/reminders/test.post");
    expect(res).toMatchObject({ success: true, to: "admin@demo.test", bell: 1, push: 1, email: 1 });
    expect(h.sends).toHaveLength(1);
    const { org, composed } = h.sends[0];
    expect(org).toMatchObject({ id: ORG, slug: "demo", timeZone: "America/Chicago" });
    expect(composed.recipients).toEqual([ADMIN]);
    expect(composed.keys).toEqual([]);
    expect(composed.template).toBe("reminder-meeting");
    expect(composed.subject.startsWith("[Test] ")).toBe(true);
    expect(writes).toEqual([]);
  });

  it("only the four reminder templates", async () => {
    for (const template of ["notice", "reminder", "reminder-nope", undefined]) {
      body = { orgId: ORG, template };
      await expect(call("#core/server/api/org/reminders/test.post")).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(h.sends).toEqual([]);
  });
});

describe("POST /api/org/requests/status-event", () => {
  const post = () => call("#core/server/api/org/requests/status-event.post");

  it("announces the status change of a request in the caller's community — and trusts nothing else in the call", async () => {
    rows.hoa_requests = [{ id: "r1", organization: ORG }];
    body = { requestId: "r1", status: "closed", recipients: ["someone"] };
    expect(await post()).toMatchObject({ success: true, sent: 1 });
    expect(notified).toEqual([[ORG, { collection: "hoa_requests", id: "r1" }, "status"]]);
  });

  it("refuses a caller who isn't a member, and a request that isn't there", async () => {
    rows.hoa_requests = [{ id: "r1", organization: { id: ORG } }];
    member = false;
    body = { requestId: "r1" };
    await expect(post()).rejects.toMatchObject({ statusCode: 403 });
    member = true;
    body = { requestId: "ghost" };
    await expect(post()).rejects.toMatchObject({ statusCode: 404 });
    body = {};
    await expect(post()).rejects.toMatchObject({ statusCode: 400 });
    expect(notified).toEqual([]);
  });
});
