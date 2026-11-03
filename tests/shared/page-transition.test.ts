import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PAGE_CUT,
  appFor,
  floorFor,
  pickPageTransition,
  shouldCutPageTransition,
  type NavOrder,
} from "#core/shared/nav/page-transition";
import { ADMIN_APPS, MEMBER_APPS } from "#core/app/composables/useAppNav";
import { ADMIN_SECTION_LINKS } from "#core/app/composables/useSectionNav";

// The real registries, so a dock reorder that changes a direction shows up here.
const ORDER: NavOrder = { adminApps: ADMIN_APPS, memberApps: MEMBER_APPS, sections: ADMIN_SECTION_LINKS };
const pick = (from: string, to: string, stack: "forward" | "back" = "forward") =>
  pickPageTransition(from, to, ORDER, stack);

describe("pickPageTransition", () => {
  it("fades on the same path (a tab or query change)", () => {
    expect(pick("/admin/members", "/admin/members")).toBe("page");
  });

  it("slides across dock apps in DOCK order, whatever the history says", () => {
    // People (1) → Money (4): later in the dock, in from the right.
    expect(pick("/admin/members", "/admin/payments", "back")).toBe("page-forward");
    // Money → People: earlier, in from the left — even as a history push.
    expect(pick("/admin/payments", "/admin/members", "forward")).toBe("page-back");
    // Home is first.
    expect(pick("/admin/requests", "/")).toBe("page-back");
  });

  it("plays the floor strip between a section's SubNav pills, in pill order", () => {
    expect(pick("/admin/members", "/admin/units")).toBe("floor-forward");
    expect(pick("/admin/units", "/admin/members")).toBe("floor-back");
    expect(pick("/admin/communications", "/polls")).toBe("floor-forward");
  });

  it("leaves a drill-down to the history stack", () => {
    expect(pick("/admin/projects", "/admin/projects/42", "forward")).toBe("page-forward");
    expect(pick("/admin/projects/42", "/admin/projects", "back")).toBe("page-back");
  });

  it("uses the member dock off /admin", () => {
    // Member dock: Home, Meetings, Documents … Meetings → Documents is forward.
    expect(pick("/meetings", "/documents")).toBe("page-forward");
    expect(pick("/documents", "/")).toBe("page-back");
  });

  it("falls back to the stack for routes outside the dock", () => {
    expect(pick("/account-thing", "/elsewhere", "back")).toBe("page-back");
  });
});

describe("appFor / floorFor", () => {
  it("longest prefix wins, root only exactly", () => {
    expect(appFor("/admin/channels/general", ADMIN_APPS)?.key).toBe("comms");
    expect(appFor("/", ADMIN_APPS)?.key).toBe("dashboard");
    expect(appFor("/admin/leads", ADMIN_APPS)?.key).toBe("requests");
  });

  it("finds the floor under a record and ignores a link's query", () => {
    expect(floorFor("/admin/projects/42", ADMIN_SECTION_LINKS.requests!)).toBe(1);
    expect(floorFor("/admin/settings/organization", ADMIN_SECTION_LINKS.settings!)).toBe(0);
    expect(floorFor("/nowhere", ADMIN_SECTION_LINKS.people!)).toBe(-1);
  });
});

describe("shouldCutPageTransition", () => {
  it("cuts when the page being left is still loading", () => {
    expect(shouldCutPageTransition({ leavingPending: true, fromOptsOut: false, toOptsOut: false })).toBe(true);
  });

  it("cuts between two routes that opt out of page transitions", () => {
    expect(shouldCutPageTransition({ leavingPending: false, fromOptsOut: true, toOptsOut: true })).toBe(true);
  });

  it("still animates into or out of an opted-out route from elsewhere", () => {
    expect(shouldCutPageTransition({ leavingPending: false, fromOptsOut: false, toOptsOut: true })).toBe(false);
    expect(shouldCutPageTransition({ leavingPending: false, fromOptsOut: true, toOptsOut: false })).toBe(false);
    expect(shouldCutPageTransition({ leavingPending: false, fromOptsOut: false, toOptsOut: false })).toBe(false);
  });
});

describe("page-transition.global middleware", () => {
  type Mw = (to: unknown, from: unknown) => void;
  let mw: Mw;
  const route = (path: string, meta: Record<string, unknown> = {}) => ({ path, params: { slug: "demo" }, meta });
  const name = () => useState<string>("page-transition-name").value;
  const setPending = (v: boolean) => {
    useState<boolean>("page-transition-pending", () => false).value = v;
  };

  beforeEach(async () => {
    vi.stubGlobal("defineNuxtRouteMiddleware", (fn: Mw) => fn);
    vi.resetModules(); // the history stack is module state
    mw = (await import("#core/app/middleware/page-transition.global")).default as Mw;
  });

  it("names the move it would animate when nothing is loading", () => {
    mw(route("/demo/admin/payments"), route("/demo/admin/members"));
    expect(name()).toBe("page-forward");
  });

  it("cuts when the user navigates away from a page still loading", () => {
    setPending(true);
    mw(route("/demo/admin/channels"), route("/demo/admin/payments"));
    expect(name()).toBe(PAGE_CUT);
  });

  it("cuts channel → channel (both opt out) but slides into Channels", () => {
    const off = { pageTransition: false };
    mw(route("/demo/admin/channels/general", off), route("/demo/admin/channels", off));
    expect(name()).toBe(PAGE_CUT);
    mw(route("/demo/admin/channels", off), route("/demo/admin/members"));
    expect(name()).not.toBe(PAGE_CUT);
  });

  it("keeps the history stack through a cut, so the next Back still pops", () => {
    mw(route("/demo/admin/members/1"), route("/demo/admin/members"));
    expect(name()).toBe("page-forward");
    setPending(true);
    mw(route("/demo/admin/members/2"), route("/demo/admin/members/1"));
    expect(name()).toBe(PAGE_CUT);
    setPending(false);
    mw(route("/demo/admin/members/1"), route("/demo/admin/members/2"));
    expect(name()).toBe("page-back");
  });

  it("fades on a same-path change even while loading (no re-key, nothing to strand)", () => {
    setPending(true);
    mw(route("/demo/admin/members"), route("/demo/admin/members"));
    expect(name()).toBe("page");
  });
});
