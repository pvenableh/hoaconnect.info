/**
 * The class rules (Earnest parity round 3, Phase 3a) — who is mailed is a legal
 * surface, so the rules are pinned here rather than trusted to the send routes:
 *
 *   · a newsletter can never be essential — refused, not quietly downgraded;
 *   · an opted-out member drops from COMMUNITY mail only;
 *   · a bounced address drops from BOTH classes.
 */

import { describe, it, expect } from "vitest";
import {
  canBeEssential,
  defaultEmailClass,
  isEmailClass,
  NEWSLETTER_NOT_ESSENTIAL,
  partitionAudience,
  resolveEmailClass,
  suppressionReason,
} from "#core/shared/email/email-class";

describe("defaultEmailClass", () => {
  it("defaults official notices to essential and news to community", () => {
    expect(defaultEmailClass("alert")).toBe("essential");
    expect(defaultEmailClass("reminder")).toBe("essential");
    expect(defaultEmailClass("notice")).toBe("essential");
    expect(defaultEmailClass("newsletter")).toBe("community");
    expect(defaultEmailClass("announcement")).toBe("community");
    expect(defaultEmailClass("basic")).toBe("community");
  });

  it("treats an unknown or missing type as community (the opt-out-able side)", () => {
    expect(defaultEmailClass("mystery")).toBe("community");
    expect(defaultEmailClass(null)).toBe("community");
    expect(defaultEmailClass(undefined)).toBe("community");
  });
});

describe("a newsletter can never be essential", () => {
  it("canBeEssential is false for newsletter only", () => {
    expect(canBeEssential("newsletter")).toBe(false);
    for (const t of ["basic", "alert", "announcement", "reminder", "notice"]) expect(canBeEssential(t)).toBe(true);
  });

  it("refuses an explicit essential newsletter with a code and a sentence", () => {
    const r = resolveEmailClass("newsletter", "essential");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(NEWSLETTER_NOT_ESSENTIAL);
      expect(r.message).toMatch(/newsletter/i);
    }
  });

  it("lets a newsletter be community, and its default is community", () => {
    expect(resolveEmailClass("newsletter", "community")).toEqual({ ok: true, emailClass: "community" });
    expect(resolveEmailClass("newsletter")).toEqual({ ok: true, emailClass: "community" });
  });

  it("honours an explicit class on every other type, either way", () => {
    expect(resolveEmailClass("announcement", "essential")).toEqual({ ok: true, emailClass: "essential" });
    expect(resolveEmailClass("notice", "community")).toEqual({ ok: true, emailClass: "community" });
  });

  it("ignores garbage and takes the type's default", () => {
    expect(resolveEmailClass("notice", "urgent")).toEqual({ ok: true, emailClass: "essential" });
    expect(resolveEmailClass("newsletter", 42)).toEqual({ ok: true, emailClass: "community" });
    expect(isEmailClass("ESSENTIAL")).toBe(false);
  });
});

describe("audience rules", () => {
  const ok = { id: "ok" };
  const out = { id: "out", email_community_opt_out: true };
  const dead = { id: "dead", email_bounced: true };
  const both = { id: "both", email_bounced: true, email_community_opt_out: true };

  it("opted-out members drop from community only", () => {
    expect(suppressionReason(out, "community")).toBe("opted_out");
    expect(suppressionReason(out, "essential")).toBeNull();
  });

  it("bounced members drop from both classes", () => {
    expect(suppressionReason(dead, "community")).toBe("bounced");
    expect(suppressionReason(dead, "essential")).toBe("bounced");
    // A dead address is the stronger reason, whatever else is set.
    expect(suppressionReason(both, "community")).toBe("bounced");
  });

  it("missing flags (fields not provisioned) mail everyone", () => {
    expect(suppressionReason(ok, "community")).toBeNull();
    expect(suppressionReason({ id: "n", email_bounced: null, email_community_opt_out: null }, "community")).toBeNull();
    expect(suppressionReason(null, "essential")).toBeNull();
  });

  it("partitions a community send", () => {
    const { recipients, suppressed } = partitionAudience([ok, out, dead, both], "community");
    expect(recipients.map((m) => m.id)).toEqual(["ok"]);
    expect(suppressed.map((s) => [s.member.id, s.reason])).toEqual([
      ["out", "opted_out"],
      ["dead", "bounced"],
      ["both", "bounced"],
    ]);
  });

  it("partitions an essential send: the opted-out member still gets it", () => {
    const { recipients, suppressed } = partitionAudience([ok, out, dead, both], "essential");
    expect(recipients.map((m) => m.id)).toEqual(["ok", "out"]);
    expect(suppressed.map((s) => s.member.id)).toEqual(["dead", "both"]);
  });
});
