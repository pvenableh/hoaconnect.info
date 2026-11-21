import { describe, expect, it } from "vitest";
import { setupIssues } from "#core/shared/home/setup-health";
import { assigneeOptions, loadByCommunity } from "#core/shared/home/manager-home";

const now = new Date("2026-11-21T12:00:00Z");
const good = { subscription_status: "active", connect_onboarding_status: "active", connect_payouts_enabled: true };

describe("setup health", () => {
  it("returns nothing for a community that is set up", () => {
    expect(setupIssues(good, { paymentsOn: true, now })).toEqual([]);
    expect(setupIssues(null, { paymentsOn: true, now })).toEqual([]);
  });
  it("flags billing, domain and payouts, worst first", () => {
    const org = { ...good, subscription_status: "past_due", custom_domain: "a.org", domain_verified: false, connect_onboarding_status: "pending" };
    const out = setupIssues(org, { paymentsOn: true, now });
    expect(out.map((i) => i.key)).toEqual(["plan", "site", "payouts"]);
    expect(out[0].tone).toBe("bad");
  });
  it("ignores payouts when payments are off and a comped account's billing", () => {
    expect(setupIssues({ is_free_account: true, connect_onboarding_status: "none" }, { paymentsOn: false, now })).toEqual([]);
  });
  it("warns on a trial that ends within a week only", () => {
    const t = (d: string) => setupIssues({ ...good, subscription_status: "trial", trial_ends_at: d }, { paymentsOn: false, now });
    expect(t("2026-11-25T00:00:00Z")[0].detail).toMatch(/4 days/);
    expect(t("2026-12-30T00:00:00Z")).toEqual([]);
  });
});

describe("community load and assignees", () => {
  it("counts open items per community, busiest first, skipping areas that are off", () => {
    const rows = [
      { id: "1", type: "question", status: "open", organization: "a" },
      { id: "2", type: "violation", status: "open", organization: "b" },
      { id: "3", type: "violation", status: "open", organization: { id: "b" } },
      { id: "4", type: "question", status: "resolved", organization: "a" },
    ];
    const comms = [{ id: "a", name: "Alder" }, { id: "b", name: "Birch" }, { id: "c", name: "Cedar" }];
    expect(loadByCommunity(rows, comms).map((c) => [c.name, c.open])).toEqual([["Birch", 2], ["Alder", 1], ["Cedar", 0]]);
    expect(loadByCommunity(rows, comms, (a) => a === "inquiries").map((c) => [c.name, c.open])).toEqual([["Alder", 1], ["Birch", 0], ["Cedar", 0]]);
  });
  it("lists people by name with Unassigned last and no duplicates", () => {
    const o = assigneeOptions([{ id: "u2", first_name: "Zed" }, { id: "u1", first_name: "Amy", last_name: "Q" }, { id: "u1" }, { id: null }]);
    expect(o).toEqual([{ id: "u1", name: "Amy Q" }, { id: "u2", name: "Zed" }, { id: "", name: "Unassigned" }]);
  });
});
