// The shared in-app notify path. Two things matter here and both are easy to get
// wrong: the per-category bell preference must actually be enforced (it was dead
// code before push needed it), and the two channels must degrade in opposite
// directions when preferences can't be read — keep the durable bell row, drop
// the interrupting push.
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
});

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
function sequencedDirectus(users: unknown, org: unknown = ORG_ROW) {
  let membershipRead = false;
  let usersRead = false;
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
    expect(res).toEqual({ bell: 0, push: 0 });
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("keeps the durable bell but sends NO push when preferences are unreadable", async () => {
    // Losing the record is worse than showing a muted category; interrupting
    // someone whose consent we just failed to read is worse than staying quiet.
    directusRequest = sequencedDirectus(new Error("perms exploded"));
    const res = await notifyUsers({ ...base, recipientUserIds: ["u1", "u2"] });
    expect(res.bell).toBe(2);
    expect(res.push).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
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
