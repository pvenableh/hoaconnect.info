import { describe, expect, it } from "vitest";
import { formsGate, formsGateMessage, type FormsPlanOrg } from "#core/shared/billing/forms-plan";

const NOW = new Date("2026-11-21T12:00:00Z");
const active = (slug: string | null, over: Partial<FormsPlanOrg> = {}): FormsPlanOrg => ({
  subscription_status: "active",
  subscription_plan: slug ? { slug } : null,
  ...over,
});

describe("forms to sign plan gating, one case per plan state", () => {
  it("blocks the Boutique band with the plan reason", () => {
    expect(formsGate(active("boutique"), NOW)).toEqual({ allowed: false, reason: "plan", plan: "boutique" });
  });
  it.each(["mid", "larger", "grand", "enterprise"])("allows the %s band", (slug) => {
    expect(formsGate(active(slug), NOW)).toEqual({ allowed: true, reason: null, plan: slug });
  });
  it("allows a contact-only plan whatever its slug", () => {
    expect(formsGate(active("signature", { subscription_plan: { slug: "signature", is_contact_only: true } }), NOW).allowed).toBe(true);
  });
  it("blocks an active org with no plan on record", () => {
    expect(formsGate(active(null), NOW)).toEqual({ allowed: false, reason: "no_plan", plan: null });
    expect(formsGate(null, NOW).reason).toBe("no_plan");
  });
  it("allows a comped free account even with no plan or Boutique", () => {
    expect(formsGate({ is_free_account: true, subscription_status: "expired" }, NOW).allowed).toBe(true);
    expect(formsGate(active("boutique", { is_free_account: true }), NOW).allowed).toBe(true);
  });
  it("blocks every unentitled state with the subscription reason, even on a Mid plan", () => {
    for (const status of ["expired", "canceled", "past_due"]) {
      expect(formsGate(active("mid", { subscription_status: status }), NOW)).toMatchObject({ allowed: false, reason: "subscription" });
    }
  });
  it("trial: allowed on Mid while it runs, blocked once it ends", () => {
    expect(formsGate(active("mid", { subscription_status: "trial", trial_ends_at: "2026-12-01T00:00:00Z" }), NOW).allowed).toBe(true);
    expect(formsGate(active("mid", { subscription_status: "trial", trial_ends_at: "2026-11-01T00:00:00Z" }), NOW).reason).toBe("subscription");
  });
  it("grace window keeps a Mid plan working, and blocks again after it", () => {
    const lapsed = { subscription_status: "canceled", grace_ends_at: "2026-11-30T00:00:00Z" };
    expect(formsGate(active("mid", lapsed), NOW).allowed).toBe(true);
    expect(formsGate(active("mid", { ...lapsed, grace_ends_at: "2026-11-01T00:00:00Z" }), NOW).allowed).toBe(false);
  });
  it("the plan's features.forms_to_sign flag overrides the band either way", () => {
    expect(formsGate(active("boutique", { subscription_plan: { slug: "boutique", features: { forms_to_sign: true } } }), NOW).allowed).toBe(true);
    expect(formsGate(active("grand", { subscription_plan: { slug: "grand", features: { forms_to_sign: false } } }), NOW)).toMatchObject({ allowed: false, reason: "plan" });
  });
  it("an agency-billed org takes the account's plan and entitlement", () => {
    const agencyMid = { subscription_status: "active", subscription_plan: { slug: "mid" } };
    expect(formsGate({ subscription_status: "expired", subscription_plan: { slug: "boutique" }, billing_account: agencyMid }, NOW).allowed).toBe(true);
    expect(formsGate({ subscription_status: "active", subscription_plan: { slug: "grand" }, billing_account: { subscription_status: "expired", subscription_plan: { slug: "grand" } } }, NOW).reason).toBe("subscription");
  });
  it("words the prompt by reason", () => {
    expect(formsGateMessage("plan")).toMatch(/Mid plan/);
    expect(formsGateMessage("subscription")).toMatch(/Renew/);
  });
});
