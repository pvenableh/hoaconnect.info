import { describe, it, expect } from "vitest";
import { bestLinkIndex, linkMatchScore } from "#core/shared/nav/link-match";

const ROOT = "/demo";
const at = (path: string, query: Record<string, unknown> = {}) => ({ path, query });

describe("section capsule — which pill is this page", () => {
  it("scores a path, a prefix, a query and a miss", () => {
    expect(linkMatchScore("/demo/admin/projects", at("/demo/admin/projects"), ROOT)).toBe(1);
    expect(linkMatchScore("/demo/admin/projects", at("/demo/admin/projects/123"), ROOT)).toBe(1);
    expect(linkMatchScore("/demo/admin/projects", at("/demo/admin/projects-old"), ROOT)).toBe(0);
    expect(linkMatchScore("/demo?tab=building", at("/demo", { tab: "building" }), ROOT)).toBe(2);
    expect(linkMatchScore("/demo?tab=building", at("/demo"), ROOT)).toBe(0);
    expect(linkMatchScore("/demo?tab=building", at("/demo", { tab: ["building"] }), ROOT)).toBe(2);
  });

  it("matches the org root only on the root itself", () => {
    expect(linkMatchScore("/demo", at("/demo"), ROOT)).toBe(1);
    expect(linkMatchScore("/demo/", at("/demo"), ROOT)).toBe(1);
    expect(linkMatchScore("/demo", at("/demo/admin/members"), ROOT)).toBe(0);
  });

  const dashboard = ["/demo", "/demo?tab=building", "/demo/admin/boardroom"];
  it.each([
    ["the dashboard", at("/demo"), 0],
    ["its Building view", at("/demo", { tab: "building" }), 1],
    ["an unknown tab falls back to Overview", at("/demo", { tab: "nope" }), 0],
    ["the Board Room", at("/demo/admin/boardroom"), 2],
  ])("Home: %s", (_label, here, want) => {
    expect(bestLinkIndex(dashboard, here, ROOT)).toBe(want);
  });

  const setup = [
    "/demo/admin/settings/organization",
    "/demo/admin/settings/domains",
    "/demo/admin/settings/organization?tab=modules",
    "/demo/admin/settings/organization?tab=subscription",
  ];
  it.each([
    ["Organization", at("/demo/admin/settings/organization"), 0],
    ["Organization on a tab with no pill of its own", at("/demo/admin/settings/organization", { tab: "branding" }), 0],
    ["Features", at("/demo/admin/settings/organization", { tab: "modules" }), 2],
    ["Billing", at("/demo/admin/settings/organization", { tab: "subscription" }), 3],
    ["a section root", at("/demo/admin/settings"), -1],
  ])("Setup: %s", (_label, here, want) => {
    expect(bestLinkIndex(setup, here, ROOT)).toBe(want);
  });
});
