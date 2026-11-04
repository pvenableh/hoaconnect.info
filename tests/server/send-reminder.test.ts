/**
 * `sendReminder` hands a composed reminder to notifyUsers exactly as before
 * (recipients, category, link, channels, urgency/TTL, essential) and, new in
 * Phase 6, the push's buttons.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let notify: ReturnType<typeof vi.fn>;
vi.mock("#core/server/utils/notify", () => ({ notifyUsers: (...a: unknown[]) => notify(...a) }));
vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test" } }));

const { sendReminder } = await import("#core/server/utils/reminders");
const { composeReminder } = await import("#core/shared/reminders/messages");

beforeEach(() => {
  notify = vi.fn(async () => ({ bell: 1, push: 1, email: 0 }));
});

const ORG = { id: "org-1" } as never;

function composed(rule: string, extra: Record<string, unknown> = {}) {
  const c = composeReminder([
    {
      key: `k:${rule}`,
      rule,
      stage: rule === "dues" ? "due" : rule === "meeting" ? "hour" : "stalled",
      template: `reminder-${rule}`,
      group: `g:${rule}`,
      category: rule === "dues" ? "payment" : rule === "meeting" ? "meeting" : "request",
      essential: rule === "dues",
      urgency: rule === "meeting" ? "high" : "normal",
      channels: ["bell", "push"],
      ttlSeconds: rule === "meeting" ? 3300 : undefined,
      entity: { collection: rule === "dues" ? "payment_requests" : rule === "meeting" ? "hoa_meetings" : "hoa_requests", id: "e1" },
      recipient: { userId: "u1" },
      vars: { amount: "$450.00", label: "Dues", due: "Tue, Nov 10", count: "1", title: "Board meeting", time: "7:00 PM", id: "e1", when: "today", date: "Nov 10", ...(extra as object) },
    } as never,
  ]);
  return c;
}

describe("sendReminder", () => {
  it("dues: the same notification as before, plus a Pay button", async () => {
    const c = composed("dues");
    await sendReminder(ORG, c);
    const o = notify.mock.calls[0]![0];
    expect(o).toMatchObject({
      organizationId: "org-1",
      recipientUserIds: c.recipients,
      category: "payment",
      subject: c.subject,
      message: c.message,
      collection: "payment_requests",
      item: "e1",
      path: "/payments",
      origin: "https://app.test",
      bell: true,
      essential: true,
      push: { urgency: c.urgency },
    });
    expect(o.pushActions).toEqual([{ action: "pay", title: "Pay", path: "/payments" }]);
  });

  it("meeting: urgency + TTL unchanged; Add to calendar points at that meeting's .ics", async () => {
    await sendReminder(ORG, composed("meeting"));
    const o = notify.mock.calls[0]![0];
    expect(o.push).toEqual({ urgency: "high", ttlSeconds: 3300 });
    expect(o.pushActions).toEqual([{ action: "calendar", title: "Add to calendar", path: "/api/meetings/e1/calendar", root: true }]);
  });

  it("push off → push: false, as before", async () => {
    const c = { ...composed("dues"), channels: ["bell"] } as never;
    await sendReminder(ORG, c);
    expect(notify.mock.calls[0]![0].push).toBe(false);
  });
});
