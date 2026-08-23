import { describe, it, expect } from "vitest";
import {
  sectionHomeFor,
  SECTION_ROOT_ROUTES,
} from "#core/app/composables/useSectionNav";

// sectionHomeFor is what stops a dock click from landing on a menu: it answers
// "where does this section actually open?". These tests pin the two ways that
// can go wrong — sending someone to a module they've switched off, and sending
// them back to the section root they just came from (a redirect loop).

const allOn = () => true;
const off = (...keys: string[]) => (m: string) => !keys.includes(m);

describe("sectionHomeFor", () => {
  it("opens each section on its first child, not on the section root", () => {
    expect(sectionHomeFor("people", allOn)).toBe("/admin/members");
    expect(sectionHomeFor("records", allOn)).toBe("/admin/meetings");
    expect(sectionHomeFor("requests", allOn)).toBe("/admin/requests");
    expect(sectionHomeFor("comms", allOn)).toBe("/admin/communications");
    expect(sectionHomeFor("payments", allOn)).toBe("/admin/payments");
  });

  it("skips a child whose module is off", () => {
    // Directory off takes Members AND Units with it; Board is next.
    expect(sectionHomeFor("people", off("directory"))).toBe("/board");
    expect(sectionHomeFor("records", off("meetings"))).toBe("/admin/documents");
    expect(sectionHomeFor("requests", off("requests"))).toBe("/admin/projects");
  });

  it("falls through to an ungated child when every gated one is off", () => {
    // Teams has no module gate, so People can never resolve to nothing.
    expect(sectionHomeFor("people", off("directory", "board", "vendors"))).toBe(
      "/admin/teams"
    );
    // Ledger is deliberately ungated (Pillar B) — Records survives the same way.
    expect(
      sectionHomeFor("records", off("meetings", "documents", "files", "rules"))
    ).toBe("/admin/ledger");
  });

  it("leaves the two sections that own a real landing page alone", () => {
    expect(sectionHomeFor("settings", allOn)).toBe("/admin/settings");
    expect(sectionHomeFor("dashboard", allOn)).toBe("/");
  });

  it("returns null for an unknown or absent key rather than guessing", () => {
    expect(sectionHomeFor("nope", allOn)).toBeNull();
    expect(sectionHomeFor(null, allOn)).toBeNull();
    expect(sectionHomeFor(undefined, allOn)).toBeNull();
  });

  it("never resolves a section root back onto itself", () => {
    // The `section-home` middleware redirects a root to sectionHomeFor(key). If
    // that ever answered with the root, the redirect would loop.
    for (const [root, key] of Object.entries(SECTION_ROOT_ROUTES)) {
      expect(sectionHomeFor(key, allOn)).not.toBe(root);
      expect(sectionHomeFor(key, allOn)).toBeTruthy();
    }
  });
});
