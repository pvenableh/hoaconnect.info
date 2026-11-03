/**
 * "Payment received" (Earnest parity round 3, Phase 5b): who is told, what it
 * says, and that it never throws into the payment that triggered it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("#core/server/utils/notify", () => ({ notifyUsers: h.notify }));
vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ cmd: "readItems", collection, query }),
}));

import { notifyPaymentReceived, paymentReceivedMessage } from "#core/server/utils/payment-notify";

const directus = (rows: unknown) => ({ request: vi.fn(async () => rows) });

beforeEach(() => {
  h.notify.mockReset();
  h.notify.mockResolvedValue({ bell: 1, push: 1, email: 0 });
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test" } }));
});

describe("paymentReceivedMessage", () => {
  it("says how much, and for what when that is short", () => {
    expect(paymentReceivedMessage(450, "usd", "November dues")).toBe("We received your payment of $450.00 for November dues. Thank you.");
    expect(paymentReceivedMessage(12.5, "usd", null)).toBe("We received your payment of $12.50. Thank you.");
    expect(paymentReceivedMessage(5, "usd", "x".repeat(200))).toBe("We received your payment of $5.00. Thank you.");
  });
});

describe("notifyPaymentReceived", () => {
  const input = { organizationId: "org-1", memberId: "m1", amount: 250, currency: "usd", label: "January dues" };

  it("gives the member who paid a bell and a push, linking to their payments", async () => {
    const d = directus([{ user: "user-1" }]);
    expect(await notifyPaymentReceived(d, input)).toBe(true);
    expect(d.request.mock.calls[0]![0]).toMatchObject({ collection: "hoa_members", query: { filter: { id: { _eq: "m1" }, organization: { _eq: "org-1" } } } });
    expect(h.notify).toHaveBeenCalledWith({
      organizationId: "org-1",
      recipientUserIds: ["user-1"],
      category: "payment",
      subject: "Payment received",
      message: "We received your payment of $250.00 for January dues. Thank you.",
      path: "/payments",
      origin: "https://app.test",
    });
  });

  it("reads the member inside the community: another community's member id finds nobody", async () => {
    const d = directus([]);
    expect(await notifyPaymentReceived(d, input)).toBe(false);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("a member with no app account has nobody to tell", async () => {
    expect(await notifyPaymentReceived(directus([{ user: null }]), input)).toBe(false);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("takes a user object as well as an id", async () => {
    expect(await notifyPaymentReceived(directus([{ user: { id: "user-2" } }]), input)).toBe(true);
    expect(h.notify.mock.calls[0]![0].recipientUserIds).toEqual(["user-2"]);
  });

  it("skips a payment with no org, member or amount", async () => {
    for (const bad of [{ ...input, organizationId: null }, { ...input, memberId: null }, { ...input, amount: 0 }]) {
      expect(await notifyPaymentReceived(directus([{ user: "u" }]), bad)).toBe(false);
    }
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("never throws into the payment that triggered it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.notify.mockRejectedValue(new Error("push provider down"));
    expect(await notifyPaymentReceived(directus([{ user: "user-1" }]), input)).toBe(false);
    const broken = { request: vi.fn(async () => { throw new Error("directus down"); }) };
    expect(await notifyPaymentReceived(broken, input)).toBe(false);
  });
});
