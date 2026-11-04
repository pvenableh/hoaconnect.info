/**
 * notifyUsers' `bellCollapse` (Parity Round 3, Phase 7.2): a channel's repeats
 * fold into ONE unread bell row per member — "3 new in #board" — instead of a
 * row per message. Read (archived) rows don't count: the next message starts a
 * fresh one. The push is untouched; its tag (collection:item) already replaces
 * the previous one on the device.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@directus/sdk", async (orig) => ({
  ...(await orig<typeof import("@directus/sdk")>()),
  readNotifications: (query: any) => ({ __n: "read", query }),
  createNotification: (data: any) => ({ __n: "create", data }),
  updateNotification: (id: string, data: any) => ({ __n: "update", id, data }),
}));

let inbox: Record<string, Array<{ id: string; subject: string }>>;
let log: Array<{ kind: string; [k: string]: any }>;
let sendPush: ReturnType<typeof vi.fn>;
let step: number;

vi.mock("#core/server/utils/push", () => ({ sendPushToUser: (...a: unknown[]) => sendPush(...a) }));
vi.mock("#core/server/utils/transactional-email", () => ({ sendBrandedTransactionalEmail: vi.fn() }));
vi.stubGlobal("getTypedDirectus", () => ({
  request: async (op: any) => {
    if (op?.__n === "read") {
      const uid = op.query.filter.recipient._eq;
      log.push({ kind: "read", uid, filter: op.query.filter });
      return inbox[uid] ?? [];
    }
    if (op?.__n === "create") {
      log.push({ kind: "create", ...op.data });
      return {};
    }
    if (op?.__n === "update") {
      log.push({ kind: "update", id: op.id, ...op.data });
      return {};
    }
    step++;
    if (step === 1) return [{ user: "u1" }, { user: "u2" }]; // org membership
    if (step === 2)
      return [
        { id: "u1", email_notifications: true, notification_preferences: null },
        { id: "u2", email_notifications: true, notification_preferences: null },
      ];
    return { id: "org-1", slug: "oak", name: "Oak Court" };
  },
}));

const { notifyUsers } = await import("#core/server/utils/notify");
const { collapsedSubject } = await import("#core/shared/channels/rules");

const opts = {
  organizationId: "org-1",
  recipientUserIds: ["u1", "u2"],
  category: "channel" as const,
  subject: "#board",
  message: "Morgan Lee: Pool vote tonight",
  collection: "hoa_channels",
  item: "chan-1",
  path: "/admin/channels/chan-1",
  bellCollapse: { subjectFor: (count: number) => collapsedSubject({ count, channelName: "board" }) },
};

beforeEach(() => {
  inbox = {};
  log = [];
  step = 0;
  sendPush = vi.fn(async () => 1);
});

describe("notifyUsers — bellCollapse", () => {
  it("the first message creates the row as '1 new in #board'", async () => {
    await notifyUsers(opts);
    const creates = log.filter((l) => l.kind === "create");
    expect(creates.map((c) => [c.recipient, c.subject, c.collection, c.item])).toEqual([
      ["u1", "1 new in #board", "hoa_channels", "chan-1"],
      ["u2", "1 new in #board", "hoa_channels", "chan-1"],
    ]);
  });

  it("looks only for the recipient's UNREAD row for this channel", async () => {
    await notifyUsers(opts);
    expect(log.find((l) => l.kind === "read")!.filter).toEqual({
      recipient: { _eq: "u1" },
      collection: { _eq: "hoa_channels" },
      item: { _eq: "chan-1" },
      status: { _eq: "inbox" },
    });
  });

  it("a later message updates that row in place ('3 new in #board') instead of adding one", async () => {
    inbox = { u1: [{ id: "n1", subject: "2 new in #board" }] };
    await notifyUsers(opts);
    expect(log.filter((l) => l.kind === "update")).toEqual([
      { kind: "update", id: "n1", subject: "3 new in #board", message: "Morgan Lee: Pool vote tonight" },
    ]);
    // u2 had nothing unread → a fresh row; u1 got no second row.
    expect(log.filter((l) => l.kind === "create").map((c) => c.recipient)).toEqual(["u2"]);
  });

  it("an unread row that isn't a collapsed one counts as one earlier message", async () => {
    inbox = { u1: [{ id: "n1", subject: "Something else" }] };
    await notifyUsers(opts);
    expect(log.find((l) => l.kind === "update")!.subject).toBe("2 new in #board");
  });

  it("still pushes to everyone, once each, tagged per channel", async () => {
    await notifyUsers({ ...opts, origin: "https://app.test" });
    expect(sendPush.mock.calls.map((c) => c[0])).toEqual(["u1", "u2"]);
    expect(sendPush.mock.calls[0]![1]).toMatchObject({ tag: "hoa_channels:chan-1", title: "#board" });
  });

  it("without bellCollapse nothing is looked up — every call adds a row, as before", async () => {
    const { bellCollapse: _drop, ...plain } = opts;
    await notifyUsers(plain);
    expect(log.some((l) => l.kind === "read")).toBe(false);
    expect(log.filter((l) => l.kind === "create").map((c) => c.subject)).toEqual(["#board", "#board"]);
  });
});
