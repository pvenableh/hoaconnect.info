/**
 * A failed send, for the admin looking at it (core/shared/email/failed-sends.ts):
 * the reasons grouped, who a retry can target, and what may be removed.
 */
import { describe, it, expect } from "vitest";
import { canRemoveEmail, failureHint, planFailedRetry, summarizeFailures } from "#core/shared/email/failed-sends";

const TEMPLATE = "400: The template_id must be a valid GUID, you provided 'd-xxxx'.";

describe("summarizeFailures", () => {
  it("groups the failed rows' reasons, most common first, and ignores every other status", () => {
    const out = summarizeFailures([
      { status: "failed", error_message: TEMPLATE },
      { status: "failed", error_message: TEMPLATE },
      { status: "failed", error_message: "500: upstream" },
      { status: "failed", error_message: "  " },
      { status: "sent", error_message: null },
      { status: "unknown", error_message: "timed out" },
    ]);
    expect(out.map((r) => [r.reason, r.count])).toEqual([
      [TEMPLATE, 2],
      ["500: upstream", 1],
      ["No reason was recorded.", 1],
    ]);
    expect(out[0]!.hint).toMatch(/template ID/);
    expect(out[2]!.hint).toBeNull();
  });

  it("is empty when nothing failed", () => {
    expect(summarizeFailures([{ status: "sent" }, { status: "suppressed" }])).toEqual([]);
  });
});

describe("failureHint", () => {
  it("names setup problems as setup problems, and knows nothing about a message it hasn't seen", () => {
    expect(failureHint(TEMPLATE)).toMatch(/setup problem/);
    expect(failureHint("401: Unauthorized")).toMatch(/API key/);
    expect(failureHint("429: too many requests")).toMatch(/later/);
    expect(failureHint("503: service unavailable")).toMatch(/later/);
    expect(failureHint("something new")).toBeNull();
  });
});

describe("planFailedRetry", () => {
  it("targets each member whose row failed once, and counts the rows it can't target", () => {
    const plan = planFailedRetry([
      { status: "failed", kind: "member", member: "m-ann" },
      { status: "failed", kind: "member", member: { id: "m-bo" } },
      { status: "failed", kind: "member", member: "m-ann" },
      { status: "failed", kind: "copy", member: null },
      { status: "failed", kind: "member", member: null },
      { status: "sent", kind: "member", member: "m-cy" },
      { status: "unknown", kind: "member", member: "m-di" },
    ]);
    expect(plan).toEqual({ memberIds: ["m-ann", "m-bo"], notRetryable: 2 });
  });
});

describe("canRemoveEmail", () => {
  it("a draft always; a failed send only when nobody was, or may have been, reached", () => {
    expect(canRemoveEmail("draft", [])).toBe(true);
    expect(canRemoveEmail("failed", [{ status: "failed" }, { status: "suppressed" }])).toBe(true);
    expect(canRemoveEmail("failed", [])).toBe(true);
    expect(canRemoveEmail("failed", [{ status: "failed" }, { status: "sent" }])).toBe(false);
    expect(canRemoveEmail("failed", [{ status: "unknown" }])).toBe(false);
  });

  it("never a sent, sending, paused or scheduled email", () => {
    for (const status of ["sent", "sending", "paused", "scheduled", null, undefined]) {
      expect(canRemoveEmail(status, [])).toBe(false);
    }
  });
});
