/**
 * The SendGrid event → member action table (Phase 3a, ported from Earnest's
 * `eventAction()`). A wrong row here either keeps mailing a dead mailbox or
 * silences a resident's dues notices over someone else's spam, so every row
 * is pinned.
 */

import { describe, it, expect } from "vitest";
import { eventAction } from "#core/shared/email/suppression-events";

describe("eventAction", () => {
  it.each([
    // [event fields, expected kind]
    [{ event: "bounce", type: "bounce", bounce_classification: "Invalid Address" }, "bounced"],
    [{ event: "bounce", type: "bounce", bounce_classification: "Mailbox Unavailable" }, "bounced"],
    [{ event: "bounce", type: "bounce" }, "bounced"],
    [{ event: "bounce", type: "bounce", bounce_classification: "" }, "bounced"],
    [{ event: "dropped", reason: "Bounced Address" }, "bounced"],
    [{ event: "dropped", reason: "  bounced address " }, "bounced"],
    [{ event: "spamreport" }, "opt_out"],
    [{ event: "spam_report" }, "opt_out"],
    [{ event: "unsubscribe" }, "opt_out"],
    [{ event: "group_unsubscribe" }, "opt_out"],
  ] as const)("%o → %s", (e, kind) => {
    expect(eventAction(e)?.kind).toBe(kind);
  });

  it.each([
    // Our mail was refused; the mailbox is fine.
    [{ event: "bounce", type: "blocked", bounce_classification: "Invalid Address" }],
    [{ event: "bounce", type: "bounce", bounce_classification: "Reputation" }],
    [{ event: "bounce", type: "bounce", bounce_classification: "Content" }],
    [{ event: "bounce", type: "bounce", bounce_classification: "Technical" }],
    [{ event: "bounce", type: "bounce", bounce_classification: "Frequency or Volume Too High" }],
    [{ event: "bounce", type: "bounce", bounce_classification: "Unclassified" }],
    [{ event: "bounce" }],
    [{ event: "dropped", reason: "Spam Reporting Address" }],
    [{ event: "dropped", reason: "Unsubscribed Address" }],
    [{ event: "dropped" }],
    [{ event: "delivered" }],
    [{ event: "deferred" }],
    [{ event: "processed" }],
    [{ event: "open" }],
    [{ event: "click" }],
    [{ event: "group_resubscribe" }],
    [{ event: "" }],
    [{}],
  ])("%o → nothing", (e) => {
    expect(eventAction(e)).toBeNull();
  });

  it("records where an opt-out came from: a spam report is `spam`, an unsubscribe is `link`", () => {
    expect(eventAction({ event: "spamreport" })).toEqual({ kind: "opt_out", source: "spam" });
    expect(eventAction({ event: "unsubscribe" })).toEqual({ kind: "opt_out", source: "link" });
    expect(eventAction({ event: "group_unsubscribe" })).toEqual({ kind: "opt_out", source: "link" });
  });

  it("keeps a short reason for the Members chip", () => {
    const a = eventAction({
      event: "bounce",
      type: "bounce",
      bounce_classification: "Invalid Address",
      reason: "550 5.1.1  The email account that you tried to reach does not exist.",
    });
    expect(a).toEqual({
      kind: "bounced",
      reason: "Invalid Address: 550 5.1.1 The email account that you tried to reach does not exist.",
    });
    const long = eventAction({ event: "bounce", type: "bounce", reason: "x".repeat(400) });
    expect(long?.kind === "bounced" && long.reason.length).toBe(238);
    expect(eventAction({ event: "dropped", reason: "Bounced Address" })).toEqual({
      kind: "bounced",
      reason: "Bounced Address (dropped)",
    });
  });
});
