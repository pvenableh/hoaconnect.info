// The shared notify path. Three things matter here and all are easy to get
// wrong: the per-category bell preference must actually be enforced (it was dead
// code before push needed it), the three channels must gate INDEPENDENTLY (bell
// on `<category>_bell`, email on the email master + `<category>`, push on the
// bell's switch and never on the email master), and they must degrade in
// opposite directions when preferences can't be read — keep the durable bell
// row, drop the interrupting push.
//
// The preference read has a retry (Phase 2b): a 403 on the
// `notification_preferences` field alone must not zero a fan-out, so the read is
// repeated WITHOUT that field and missing keys fall back to their documented
// opt-in default. "Unreadable" now means both reads failed.
//
// Everyone named below is a member of ORG. That is a precondition now, not a
// detail: notifyUsers filters recipients to the org before it does anything
// else, so a fixture whose users have no membership would report zero of
// everything and tell you nothing about preferences. The gate itself is tested
// in notify-org-scope.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

let directusRequest: ReturnType<typeof vi.fn>;
let sendPush: ReturnType<typeof vi.fn>;

vi.mock("#core/server/utils/push", () => ({
  sendPushToUser: (...a: unknown[]) => sendPush(...a),
}));

let sendEmail: ReturnType<typeof vi.fn>;
vi.mock("#core/server/utils/transactional-email", () => ({
  sendBrandedTransactionalEmail: (...a: unknown[]) => sendEmail(...a),
}));

vi.stubGlobal("getTypedDirectus", () => ({ request: (...a: unknown[]) => directusRequest(...a) }));

const { notifyUsers } = await import("#core/server/utils/notify");

const ORG = "org-1";
const ORG_ROW = { id: ORG, slug: "605-lincoln", name: "605 Lincoln Road" };

const base = {
  organizationId: ORG,
  category: "task" as const,
  subject: "New task assigned",
  message: 'You were assigned "Fix the roof".',
  collection: "hoa_tasks",
  item: "task-1",
  path: "/admin/projects",
};

beforeEach(() => {
  vi.clearAllMocks();
  sendPush = vi.fn(async () => 1);
  sendEmail = vi.fn(async () => undefined);
});

/** The email twin a caller opts into. Omitted, notifyUsers stays bell + push. */
const EMAIL = { bodyHtml: "<p>You were assigned something.</p>" };

/** Who the email twin actually went to, in call order. */
const emailedIds = (): string[] =>
  (sendEmail.mock.calls[0]?.[0] as { recipientUserIds: string[] } | undefined)
    ?.recipientUserIds ?? [];

/** The org roster. Every recipient these tests name belongs to ORG. */
const MEMBER_ROWS = [{ user: "u1" }, { user: "u2" }, { user: "u3" }];

/**
 * The SDK's request thunks aren't introspectable, so drive the fake by call
 * ORDER instead: notifyUsers checks membership, then reads users, then writes
 * N bells, then reads the org.
 *
 * The membership read is served unconditionally — these tests are about
 * preferences and push, and a fixture that also had to model tenancy would be
 * testing two things at once. Note it survives `users instanceof Error`: the
 * preferences-unreadable case must still know who belongs here, which is the
 * whole reason the gate sits in front of that fallback rather than inside it.
 */
function sequencedDirectus(users: unknown, org: unknown = ORG_ROW, retryUsers?: unknown) {
  let membershipRead = false;
  let usersRead = false;
  let retryRead = false;
  return vi.fn(async () => {
    if (!membershipRead) {
      membershipRead = true;
      return MEMBER_ROWS;
    }
    if (!usersRead) {
      usersRead = true;
      if (users instanceof Error) throw users;
      return users;
    }
    // The full-field read threw, so notifyUsers retries without the prefs
    // field. `retryUsers` is what that reduced read returns (an Error means
    // even that failed, which is the only true "unreadable" case).
    if (users instanceof Error && !retryRead) {
      retryRead = true;
      if (retryUsers instanceof Error || retryUsers === undefined) {
        throw retryUsers instanceof Error ? retryUsers : new Error("retry failed too");
      }
      return retryUsers;
    }
    // Everything after: bell writes return nothing meaningful; the org read is
    // the only other read and tolerates the same shape.
    if (org instanceof Error) throw org;
    return org;
  });
}

describe("notifyUsers", () => {
  it("notifies everyone when nobody has configured preferences", async () => {
    directusRequest = sequencedDirectus([{ id: "u1" }, { id: "u2" }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1", "u2"] });
    expect(res.bell).toBe(2);
    expect(sendPush).toHaveBeenCalledTimes(2);
  });

  it("enforces the per-category bell preference on BOTH channels", async () => {
    directusRequest = sequencedDirectus([
      { id: "u1", notification_preferences: { task_bell: false } },
      { id: "u2" },
    ]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1", "u2"] });
    expect(res.bell).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it("still notifies someone who only muted the category's EMAIL", async () => {
    directusRequest = sequencedDirectus([{ id: "u1", notification_preferences: { task: false } }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"] });
    expect(res.bell).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it("honors the master mute", async () => {
    directusRequest = sequencedDirectus([{ id: "u1", notification_preferences: { _all: false } }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"] });
    expect(res.bell).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("excludes the actor who caused the event", async () => {
    directusRequest = sequencedDirectus([{ id: "u2" }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1", "u2"], excludeUserId: "u1" });
    expect(res.bell).toBe(1);
  });

  it("dedupes a repeated recipient", async () => {
    directusRequest = sequencedDirectus([{ id: "u1" }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1", "u1", "u1"] });
    expect(res.bell).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and touches nothing, with no recipients", async () => {
    directusRequest = sequencedDirectus([]);
    const res = await notifyUsers({ ...base, recipientUserIds: [] });
    expect(res).toEqual({ bell: 0, push: 0, email: 0 });
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("retries WITHOUT the prefs field when that field alone is unreadable", async () => {
    // The prod failure this exists for: a missing or perm-blocked
    // `notification_preferences` column 403s the whole bulk read, and treating
    // that as "everyone opted out" silently zeroes the fan-out. Missing keys
    // mean opt-IN, so the reduced read is the documented default, not a guess —
    // and all three channels proceed.
    directusRequest = sequencedDirectus(new Error("field 403"), ORG_ROW, [
      { id: "u1" },
      { id: "u2" },
    ]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1", "u2"], email: EMAIL });
    expect(res.bell).toBe(2);
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(emailedIds()).toEqual(["u1", "u2"]);
  });

  it("keeps the durable bell but sends NO push or email when BOTH reads fail", async () => {
    // Losing the record is worse than showing a muted category; interrupting
    // someone whose consent we just failed to read is worse than staying quiet.
    directusRequest = sequencedDirectus(
      new Error("perms exploded"),
      ORG_ROW,
      new Error("still exploded")
    );
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1", "u2"], email: EMAIL });
    expect(res.bell).toBe(2);
    expect(res.push).toBe(0);
    expect(res.email).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips push when the org has no slug — an unscoped push is useless", async () => {
    // A distinct org id, because org context is cached for 5 minutes and the
    // tests above have already warmed ORG with a valid slug.
    const SLUGLESS = "org-no-slug";
    directusRequest = sequencedDirectus([{ id: "u1" }], { id: SLUGLESS, slug: null, name: "X" });
    const res = await notifyUsers({ ...base, organizationId: SLUGLESS, recipientUserIds: ["u1"] });
    expect(res.bell).toBe(1);
    expect(res.push).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("builds an org-scoped, tagged payload", async () => {
    directusRequest = sequencedDirectus([{ id: "u1" }]);
    await notifyUsers({ ...base, recipientUserIds: ["u1"], origin: "https://605lincolnroad.com" });
    const [, payload] = sendPush.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.url).toBe("https://605lincolnroad.com/605-lincoln/admin/projects");
    expect(payload.tag).toBe("hoa_tasks:task-1");
    expect(payload.org).toEqual({ id: ORG, slug: "605-lincoln", name: "605 Lincoln Road" });
  });

  it("survives a push failure without losing the bell", async () => {
    directusRequest = sequencedDirectus([{ id: "u1" }]);
    sendPush = vi.fn(async () => {
      throw new Error("push service down");
    });
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"] });
    expect(res.bell).toBe(1);
    expect(res.push).toBe(0);
  });
});

/**
 * Three switches, three answers. The failure mode this guards is a chain: gate
 * push behind the email master and "turn off emails" silences someone's phone;
 * gate email behind the bell and muting a noisy in-app category stops the
 * receipt that person actually needed.
 */
describe("the three channels gate independently", () => {
  it("sends no email at all unless the caller asked for one", async () => {
    directusRequest = sequencedDirectus([{ id: "u1" }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"] });
    expect(res.email).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails, bells and pushes someone with no preferences at all", async () => {
    directusRequest = sequencedDirectus([{ id: "u1" }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"], email: EMAIL });
    expect(res).toEqual({ bell: 1, push: 1, email: 1 });
  });

  it("the EMAIL master toggle silences email and nothing else", async () => {
    // "Stop emailing me" is not "stop notifying me".
    directusRequest = sequencedDirectus([{ id: "u1", email_notifications: false }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"], email: EMAIL });
    expect(res).toEqual({ bell: 1, push: 1, email: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("the per-category EMAIL opt-out silences email and nothing else", async () => {
    directusRequest = sequencedDirectus([{ id: "u1", notification_preferences: { task: false } }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"], email: EMAIL });
    expect(res).toEqual({ bell: 1, push: 1, email: 0 });
  });

  it("the per-category BELL opt-out silences bell AND push, but not email", async () => {
    // Push is the bell's mobile twin — no row, no push. Email is its own
    // channel and a quiet app is not a request for a quiet inbox.
    directusRequest = sequencedDirectus([
      { id: "u1", notification_preferences: { task_bell: false } },
    ]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"], email: EMAIL });
    expect(res).toEqual({ bell: 0, push: 0, email: 1 });
    expect(emailedIds()).toEqual(["u1"]);
  });

  it("the master mute silences all three", async () => {
    directusRequest = sequencedDirectus([{ id: "u1", notification_preferences: { _all: false } }]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1"], email: EMAIL });
    expect(res).toEqual({ bell: 0, push: 0, email: 0 });
  });

  it("routes each recipient by their own preferences on one fan-out", async () => {
    directusRequest = sequencedDirectus([
      { id: "u1", notification_preferences: { task_bell: false } }, // email only
      { id: "u2", notification_preferences: { task: false } }, // bell + push only
      { id: "u3" }, // everything
    ]);
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1", "u2", "u3"], email: EMAIL });
    expect(res).toEqual({ bell: 2, push: 2, email: 2 });
    expect(emailedIds()).toEqual(["u1", "u3"]);
  });

  it("passes the category down so the email path re-checks the same switch", async () => {
    // sendBrandedTransactionalEmail is also called directly from other paths,
    // so it re-scopes and re-checks. A boundary that only holds when its caller
    // remembers to check is not a boundary.
    directusRequest = sequencedDirectus([{ id: "u1" }]);
    await notifyUsers({ ...base, recipientUserIds: ["u1"], email: EMAIL });
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      organizationId: ORG,
      category: "task",
      subject: base.subject,
    });
  });
});
