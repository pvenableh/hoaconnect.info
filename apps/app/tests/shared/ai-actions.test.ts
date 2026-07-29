import { describe, it, expect } from "vitest";
import {
  ACTION_CATALOG,
  actionByKey,
  shouldAutoApprove,
  DEFAULT_AUTONOMY_TIER,
  type AutonomyTier,
} from "#core/shared/ai/actions";

describe("action catalog", () => {
  it("has unique keys", () => {
    const keys = ACTION_CATALOG.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("marks every comms action outbound and high risk", () => {
    for (const a of ACTION_CATALOG.filter((x) => x.category === "comms")) {
      expect(a.outbound).toBe(true);
      expect(a.risk).toBe("high");
    }
  });

  it("marks non-comms actions as not outbound", () => {
    for (const a of ACTION_CATALOG.filter((x) => x.category !== "comms")) {
      expect(a.outbound).toBe(false);
    }
  });

  it("resolves by key", () => {
    expect(actionByKey("send_email")?.category).toBe("comms");
    expect(actionByKey("nope")).toBeUndefined();
  });
});

describe("shouldAutoApprove", () => {
  it("defaults to tier 0 = everything requires approval", () => {
    expect(DEFAULT_AUTONOMY_TIER).toBe(0);
    for (const a of ACTION_CATALOG) {
      expect(shouldAutoApprove(a, 0)).toBe(false);
    }
  });

  it("NEVER auto-approves outbound actions at any tier (hard cap)", () => {
    const tiers: AutonomyTier[] = [0, 1, 2, 3];
    for (const a of ACTION_CATALOG.filter((x) => x.outbound)) {
      for (const t of tiers) {
        expect(shouldAutoApprove(a, t)).toBe(false);
      }
    }
  });

  it("tier 1 auto-approves only low-risk internal actions", () => {
    expect(shouldAutoApprove("create_task", 1)).toBe(true); // internal low
    expect(shouldAutoApprove("update_request_status", 1)).toBe(false); // medium
    expect(shouldAutoApprove("set_due_date", 1)).toBe(false); // low but scheduling, not internal
  });

  it("tier 2 auto-approves any non-outbound up to medium risk", () => {
    expect(shouldAutoApprove("update_request_status", 2)).toBe(true);
    expect(shouldAutoApprove("schedule_meeting", 2)).toBe(true);
    expect(shouldAutoApprove("send_email", 2)).toBe(false); // outbound high
  });

  it("tier 3 auto-approves any non-outbound action, still never outbound", () => {
    expect(shouldAutoApprove("update_member_field", 3)).toBe(true);
    expect(shouldAutoApprove("log_violation", 3)).toBe(true);
    expect(shouldAutoApprove("post_announcement", 3)).toBe(false);
  });

  it("unknown actions never auto-approve", () => {
    expect(shouldAutoApprove("does_not_exist", 3)).toBe(false);
  });
});
