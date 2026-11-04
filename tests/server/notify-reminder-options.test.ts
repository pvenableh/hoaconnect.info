/**
 * notifyUsers' reminder options (Earnest parity round 3, Phase 5a): `bell:
 * false` is a push without a row (the meeting-in-an-hour reminder), still
 * gated on the bell's switch; `push` carries a Web Push urgency and TTL, or is
 * off; `essential` lets the email twin past the category opt-out (never past
 * the master switch) and hands the partial through.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let directusRequest: ReturnType<typeof vi.fn>;
let sendPush: ReturnType<typeof vi.fn>;
let sendEmail: ReturnType<typeof vi.fn>;

vi.mock("#core/server/utils/push", () => ({ sendPushToUser: (...a: unknown[]) => sendPush(...a) }));
vi.mock("#core/server/utils/transactional-email", () => ({ sendBrandedTransactionalEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.stubGlobal("getTypedDirectus", () => ({ request: (...a: unknown[]) => directusRequest(...a) }));

const { notifyUsers } = await import("#core/server/utils/notify");

const ORG_ROW = { id: "org-1", slug: "oak", name: "Oak Court" };
const USERS = [
  { id: "u1", email_notifications: true, notification_preferences: null },
  { id: "u2", email_notifications: true, notification_preferences: { meeting_bell: false, payment: false } },
  { id: "u3", email_notifications: false, notification_preferences: null },
];

/** membership → users → (bell writes) → org: by call order, as notify.test.ts does. */
function sequenced() {
  let step = 0;
  return vi.fn(async () => {
    step++;
    if (step === 1) return USERS.map((u) => ({ user: u.id }));
    if (step === 2) return USERS;
    return ORG_ROW;
  });
}

const base = { organizationId: "org-1", recipientUserIds: ["u1", "u2", "u3"], subject: "Board meeting starts at 7:00 PM", message: "In about an hour." };

beforeEach(() => {
  directusRequest = sequenced();
  sendPush = vi.fn(async () => 1);
  sendEmail = vi.fn(async () => 1);
});

describe("notifyUsers — reminder options", () => {
  it("bell: false writes no row; push still follows the bell's switch and carries urgency + TTL", async () => {
    const r = await notifyUsers({ ...base, category: "meeting", bell: false, push: { urgency: "high", ttlSeconds: 3300 } });
    expect(r).toEqual({ bell: 0, push: 2, email: 0 });
    // membership, users, org — no createNotification in between.
    expect(directusRequest).toHaveBeenCalledTimes(3);
    expect(sendPush.mock.calls.map((c) => c[0])).toEqual(["u1", "u3"]);
    expect(sendPush.mock.calls[0]![2]).toEqual({ urgency: "high", ttlSeconds: 3300 });
  });

  it("pushActions ride into the payload as resolved buttons (Phase 6)", async () => {
    await notifyUsers({
      ...base,
      category: "meeting",
      collection: "hoa_meetings",
      item: "m1",
      path: "/meetings",
      origin: "https://app.test",
      pushActions: [{ action: "calendar", title: "Add to calendar", path: "/api/meetings/m1/calendar", root: true }],
    });
    expect(sendPush.mock.calls[0]![1]).toMatchObject({
      tag: "hoa_meetings:m1",
      url: "https://app.test/oak/meetings",
      actions: [{ action: "calendar", title: "Add to calendar", url: "https://app.test/api/meetings/m1/calendar" }],
    });
  });

  it("push: false sends no push; the default still does, with no options", async () => {
    expect((await notifyUsers({ ...base, category: "request", push: false })).push).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
    directusRequest = sequenced();
    await notifyUsers({ ...base, category: "request" });
    expect(sendPush.mock.calls[0]![2]).toBeUndefined();
  });

  it("essential: past the category opt-out, not the master switch; the partial goes through", async () => {
    const contentPartial = { name: "reminder-dues", source: "<mj-section />", vars: { amount: "$450.00" } };
    await notifyUsers({
      ...base,
      category: "payment",
      essential: true,
      email: { bodyHtml: "<p>x</p>", emailType: "reminder", contentPartial },
    });
    const args = sendEmail.mock.calls[0]![0];
    expect(args.recipientUserIds).toEqual(["u1", "u2"]);
    expect(args).toMatchObject({ essential: true, emailType: "reminder", contentPartial, category: "payment" });
  });

  it("not essential: the category opt-out holds, as before", async () => {
    await notifyUsers({ ...base, category: "payment", email: { bodyHtml: "<p>x</p>" } });
    const args = sendEmail.mock.calls[0]![0];
    expect(args.recipientUserIds).toEqual(["u1"]);
    expect(args).toMatchObject({ essential: false, contentPartial: null });
  });
});
