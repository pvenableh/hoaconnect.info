// "Resend to these N unknown": who is ready (an hour with no SendGrid event), who waits, who can't be targeted.
import { describe, expect, it } from "vitest";
import { planUnknownResend, RESEND_UNKNOWN_AFTER_MS } from "#core/shared/email/resend-unknown";

const NOW = Date.parse("2026-11-12T15:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("planUnknownResend", () => {
  it("an unknown member row is ready after an hour, not before", () => {
    const plan = planUnknownResend(
      [
        { status: "unknown", kind: "member", member: "m-old", claimed_at: ago(RESEND_UNKNOWN_AFTER_MS) },
        { status: "unknown", kind: "member", member: { id: "m-new" }, claimed_at: ago(10 * 60 * 1000) },
      ],
      NOW
    );
    expect(plan.memberIds).toEqual(["m-old"]);
    expect(plan.waiting).toBe(1);
    expect(plan.readyAt).toBe(new Date(NOW + 50 * 60 * 1000).toISOString());
  });

  it("only unknown rows count; sent, failed and suppressed never come back", () => {
    const old = ago(2 * RESEND_UNKNOWN_AFTER_MS);
    const plan = planUnknownResend(
      ["sent", "failed", "suppressed", "queued", "claimed"].map((status, i) => ({ status, kind: "member", member: `m${i}`, claimed_at: old })),
      NOW
    );
    expect(plan).toEqual({ memberIds: [], waiting: 0, readyAt: null, notResendable: 0 });
  });

  it("the cc/bcc copy and a row with no member can't be targeted", () => {
    const old = ago(2 * RESEND_UNKNOWN_AFTER_MS);
    const plan = planUnknownResend(
      [
        { status: "unknown", kind: "copy", member: null, claimed_at: old },
        { status: "unknown", kind: "member", member: null, claimed_at: old },
        { status: "unknown", kind: "member", member: "m1", claimed_at: null },
      ],
      NOW
    );
    expect(plan.memberIds).toEqual(["m1"]); // no claim time: a long-dead run, so ready
    expect(plan.notResendable).toBe(2);
  });
});
