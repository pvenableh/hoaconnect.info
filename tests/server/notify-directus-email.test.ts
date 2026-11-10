/**
 * Directus's own per-notification email (Operator console, Session H).
 *
 * Directus core emails every new `directus_notifications` row, from its own
 * sender, to a recipient whose stock `email_notifications` is true — and it has
 * no setting to stop that. The app emails its own branded twin, so a member got
 * two copies of everything. The fix has two halves, and these tests hold both:
 *
 *   1. The app's email obeys the app's switch (`_email` in
 *      `notification_preferences`), and `email_notifications` no longer governs it.
 *   2. Nothing the app does leaves `email_notifications` true: users are created
 *      with it false, the preference and profile saves never write it true, and
 *      `notifyUsers` turns it off for a straggler BEFORE writing their bell row.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@directus/sdk", async (orig) => ({
  ...(await orig<typeof import("@directus/sdk")>()),
  readUsers: (query: any) => ({ __n: "readUsers", query }),
  readUser: (id: string, query: any) => ({ __n: "readUser", id, query }),
  updateUsers: (ids: string[], data: any) => ({ __n: "updateUsers", ids, data }),
  updateUser: (id: string, data: any) => ({ __n: "updateUser", id, data }),
  updateMe: (data: any) => ({ __n: "updateMe", data }),
  createNotification: (data: any) => ({ __n: "createNotification", data }),
}));

let users: Array<Record<string, unknown>>;
let storedPrefs: unknown;
let failUpdateUsers: boolean;
let log: Array<{ n: string; [k: string]: any }>;
let sendEmail: ReturnType<typeof vi.fn>;

vi.mock("#core/server/utils/push", () => ({ sendPushToUser: async () => 0 }));
vi.mock("#core/server/utils/transactional-email", () => ({
  sendBrandedTransactionalEmail: (...a: unknown[]) => sendEmail(...a),
}));

const directus = {
  request: async (op: any) => {
    switch (op?.__n) {
      case "readUsers":
        log.push({ n: "readUsers" });
        return users;
      case "readUser":
        log.push({ n: "readUser" });
        return { notification_preferences: storedPrefs };
      case "updateUsers":
        log.push({ n: "updateUsers", ids: op.ids, data: op.data });
        if (failUpdateUsers) throw new Error("403");
        return [];
      case "updateUser":
        log.push({ n: "updateUser", data: op.data });
        return {};
      case "updateMe":
        log.push({ n: "updateMe", data: op.data });
        return {};
      case "createNotification":
        log.push({ n: "createNotification", recipient: op.data.recipient });
        return {};
      default:
        // The org-membership read, then the org row for push context.
        return users.length && !log.some((l) => l.n === "membership")
          ? (log.push({ n: "membership" }), users.map((u) => ({ user: u.id })))
          : { id: "org-1", slug: "oak", name: "Oak Court" };
    }
  },
};

vi.stubGlobal("getTypedDirectus", () => directus);
vi.stubGlobal("getUserDirectus", async () => directus);
vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("readBody", async (e: any) => e?.__body);
vi.stubGlobal("getUserSession", async () => ({ user: { id: "u1" } }));
vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.statusMessage || o.message), o));

const { notifyUsers } = await import("#core/server/utils/notify");
const { DIRECTUS_EMAIL_OFF } = await import("#core/shared/notifications/preferences");
const patchPrefs = (await import("#core/server/api/user/notification-preferences.patch")).default as any;
const getPrefs = (await import("#core/server/api/user/notification-preferences.get")).default as any;
const usersMe = (await import("#core/server/api/directus/users/me")).default as any;

const base = {
  organizationId: "org-1",
  category: "task" as const,
  subject: "New task assigned",
  message: "You were assigned something.",
  email: { bodyHtml: "<p>You were assigned something.</p>" },
};

beforeEach(() => {
  users = [];
  storedPrefs = null;
  failUpdateUsers = false;
  log = [];
  sendEmail = vi.fn(async () => undefined);
});

const emailedIds = (): string[] =>
  (sendEmail.mock.calls[0]?.[0] as { recipientUserIds: string[] } | undefined)?.recipientUserIds ?? [];

describe("the app's email obeys the app's switch, not Directus's", () => {
  it("still emails a member whose Directus `email_notifications` is false", async () => {
    users = [{ id: "u1", email_notifications: false, notification_preferences: null }];
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"] });
    expect(res.email).toBe(1);
    expect(emailedIds()).toEqual(["u1"]);
  });

  it("`_email: false` stops the app's email and nothing else", async () => {
    users = [{ id: "u1", email_notifications: false, notification_preferences: { _email: false } }];
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"] });
    expect(res).toMatchObject({ bell: 1, email: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("`_email: false` stops even an essential email; a category opt-out doesn't", async () => {
    users = [
      { id: "u1", notification_preferences: { _email: false } },
      { id: "u2", notification_preferences: { task: false } },
    ];
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1", "u2"], essential: true });
    expect(res.email).toBe(1);
    expect(emailedIds()).toEqual(["u2"]);
  });
});

describe("notifyUsers turns Directus's email off before writing the bell", () => {
  it("flips a recipient still at true, in one write, BEFORE their row", async () => {
    users = [
      { id: "u1", email_notifications: true, notification_preferences: null },
      { id: "u2", email_notifications: false, notification_preferences: null },
      { id: "u3", email_notifications: null, notification_preferences: null },
    ];
    await notifyUsers({ ...base, recipientUserIds: ["u1", "u2", "u3"] });
    const updates = log.filter((l) => l.n === "updateUsers");
    expect(updates).toEqual([{ n: "updateUsers", ids: ["u1"], data: { email_notifications: false } }]);
    const firstBell = log.findIndex((l) => l.n === "createNotification");
    expect(log.findIndex((l) => l.n === "updateUsers")).toBeLessThan(firstBell);
    expect(log.filter((l) => l.n === "createNotification")).toHaveLength(3);
  });

  it("writes nothing to the user when nobody is at true", async () => {
    users = [{ id: "u1", email_notifications: false, notification_preferences: null }];
    await notifyUsers({ ...base, recipientUserIds: ["u1"] });
    expect(log.some((l) => l.n === "updateUsers")).toBe(false);
  });

  it("doesn't flip someone who gets no row (bell muted, or a push-only call)", async () => {
    users = [{ id: "u1", email_notifications: true, notification_preferences: { task_bell: false } }];
    await notifyUsers({ ...base, recipientUserIds: ["u1"] });
    users = [{ id: "u2", email_notifications: true, notification_preferences: null }];
    log = [];
    await notifyUsers({ ...base, recipientUserIds: ["u2"], bell: false });
    expect(log.some((l) => l.n === "updateUsers")).toBe(false);
  });

  it("still writes the bell when the flip fails — a duplicate beats a missing row", async () => {
    failUpdateUsers = true;
    users = [{ id: "u1", email_notifications: true, notification_preferences: null }];
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"] });
    expect(res.bell).toBe(1);
  });
});

describe("the preference endpoints keep the app's switch in `_email`", () => {
  it("GET reports `_email`, ignoring Directus's field", async () => {
    storedPrefs = { _email: false, meeting: false };
    expect(await getPrefs({})).toEqual({
      email_enabled: false,
      notification_preferences: { _email: false, meeting: false },
    });
    storedPrefs = null;
    expect((await getPrefs({})).email_enabled).toBe(true);
  });

  it("an email-only save keeps the stored categories and silences Directus", async () => {
    storedPrefs = { meeting: false, digest_enabled: true };
    await patchPrefs({ __body: { email_enabled: false } });
    expect(log.find((l) => l.n === "updateUser")?.data).toEqual({
      notification_preferences: { meeting: false, digest_enabled: true, _email: false },
      email_notifications: false,
    });
  });

  it("a category save without `_email` keeps the stored one", async () => {
    storedPrefs = { _email: false };
    await patchPrefs({ __body: { notification_preferences: { meeting: false } } });
    expect(log.find((l) => l.n === "updateUser")?.data.notification_preferences).toEqual({
      meeting: false,
      _email: false,
    });
  });

  it("`email_enabled` wins over a stale `_email` in the same save", async () => {
    storedPrefs = { _email: false };
    await patchPrefs({ __body: { email_enabled: true, notification_preferences: { _email: false } } });
    expect(log.find((l) => l.n === "updateUser")?.data.notification_preferences._email).toBe(true);
  });

  it("never writes Directus's field true, even when asked to", async () => {
    await expect(patchPrefs({ __body: { email_notifications: true } })).rejects.toMatchObject({
      statusCode: 400,
    });
    await patchPrefs({ __body: { email_notifications: true, email_enabled: true } });
    expect(log.find((l) => l.n === "updateUser")?.data.email_notifications).toBe(false);
  });

  it("a profile save through /api/directus/users/me drops `email_notifications`", async () => {
    await usersMe({ method: "PATCH", __body: { first_name: "Pat", email_notifications: true } });
    expect(log.find((l) => l.n === "updateMe")?.data).toEqual({ first_name: "Pat" });
  });
});

describe("every path that creates a user starts with Directus's email off", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
    });
  const server = files("core/server").map((p) => ({ p, src: readFileSync(p, "utf8") }));

  it("spreads DIRECTUS_EMAIL_OFF into every createUser payload", () => {
    // utils/directus.ts only re-exports the SDK's createUser.
    const creators = server.filter(({ p, src }) => /createUser\(/.test(src) && !p.endsWith("utils/directus.ts"));
    const missing = creators
      .filter(({ src }) => !src.includes("...DIRECTUS_EMAIL_OFF"))
      .map(({ p }) => p);
    expect(creators.length).toBeGreaterThanOrEqual(3);
    expect(missing).toEqual([]);
    expect(DIRECTUS_EMAIL_OFF).toEqual({ email_notifications: false });
  });

  it("no server code writes `email_notifications: true`", () => {
    const offenders = server.filter(({ src }) => /email_notifications\s*:\s*true/.test(src)).map(({ p }) => p);
    expect(offenders).toEqual([]);
  });
});
