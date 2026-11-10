/**
 * The platform notice (launch-followups Session 2): where it goes, what it
 * says, and that it never throws (a Stripe webhook awaits it).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("#core/server/utils/sendgrid", async (orig) => ({
  ...((await orig()) as object),
  sendEmail: h.sendEmail,
}));
vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test/" } }));

const notify = await import("#core/server/utils/platform-notify");

beforeEach(() => {
  h.sendEmail.mockReset();
  h.sendEmail.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("platform notices", () => {
  it("go to BILLING_NOTIFY_EMAIL, or support@ when it's unset", () => {
    expect(notify.platformNotifyAddress(undefined)).toBe("support@hoaconnect.info");
    expect(notify.platformNotifyAddress("  ")).toBe("support@hoaconnect.info");
    expect(notify.platformNotifyAddress("peter@example.test")).toBe("peter@example.test");
  });

  it("say who subscribed, on what band, how many units and how often, with a console link", async () => {
    vi.stubEnv("BILLING_NOTIFY_EMAIL", "");
    vi.stubEnv("OUTBOUND_EMAIL_ONLY_TO", "");
    await expect(
      notify.notifySubscriptionActivated({ orgId: "org-1", orgName: "Harbor <Court>", previousStatus: "trial", band: "boutique", units: "28", interval: "month" })
    ).resolves.toBe(true);
    const msg = h.sendEmail.mock.calls[0]![0];
    expect(msg.to).toBe("support@hoaconnect.info");
    expect(msg.subject).toBe("New subscriber: Harbor <Court>");
    expect(msg.text).toContain("Band: boutique");
    expect(msg.text).toContain("Units: 28");
    expect(msg.text).toContain("Billed: Monthly");
    expect(msg.text).toContain("https://app.test/ops/communities/org-1");
    expect(msg.html).toContain("Harbor &lt;Court&gt;");
    expect(msg.html).not.toContain("<Court>");
  });

  it("call a lapsed community's return what it is", async () => {
    await notify.notifySubscriptionActivated({ orgId: "o", orgName: "Pines", previousStatus: "past_due" });
    expect(h.sendEmail.mock.calls[0]![0].subject).toBe("Subscription active again: Pines");
    expect(h.sendEmail.mock.calls[0]![0].text).toContain("Was: past due");
  });

  it("never throw: a failed send is false and logged", async () => {
    h.sendEmail.mockRejectedValueOnce(new Error("SendGrid down"));
    await expect(notify.notifyPlatform({ subject: "x", rows: [] })).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("respect OUTBOUND_EMAIL_ONLY_TO", async () => {
    vi.stubEnv("OUTBOUND_EMAIL_ONLY_TO", "@example.test");
    await expect(notify.notifyPlatform({ subject: "x", rows: [] })).resolves.toBe(false);
    expect(h.sendEmail).not.toHaveBeenCalled();
    vi.stubEnv("BILLING_NOTIFY_EMAIL", "peter@example.test");
    await expect(notify.notifyPlatform({ subject: "x", rows: [] })).resolves.toBe(true);
  });
});
