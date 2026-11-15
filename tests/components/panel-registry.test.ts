/**
 * The panel registry (docs/spec-resource-scaffold.md): every panel loads, and
 * a resource panel's full-page route exists, carries its index's middleware,
 * and is gated by the nav registry exactly as its index is — so a deep link
 * to a record never opens to someone the index would refuse.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PANELS, getPanelEntry, hasPanel, recordPath } from "~/components/panels/registry";
import { entriesForPath } from "#core/shared/nav/registry";

const ROOT = resolve(__dirname, "../..");

/** Org-relative path → its page file under app/pages/[slug]. */
function pageFile(rel: string): string {
  const parts = rel.replace(/^\//, "").replace(/:id/g, "[id]");
  const direct = resolve(ROOT, "app/pages/[slug]", `${parts}.vue`);
  return existsSync(direct) ? direct : resolve(ROOT, "app/pages/[slug]", parts, "index.vue");
}

function middlewareOf(file: string): string[] {
  const m = readFileSync(file, "utf8").match(/middleware:\s*\[([^\]]*)\]/);
  return (m?.[1] ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

const resourcePanels = Object.entries(PANELS).filter(([, e]) => e.resource);

describe("panel registry", () => {
  it("every panel has a loader", () => {
    for (const [type, e] of Object.entries(PANELS)) {
      expect(typeof e.load, type).toBe("function");
      expect(hasPanel(type)).toBe(true);
      expect(getPanelEntry(type)).toBe(e);
    }
    expect(hasPanel("nope")).toBe(false);
    expect(getPanelEntry("nope")).toBeNull();
  });

  it("a resource panel names its index and a page under it", () => {
    for (const [type, e] of resourcePanels) {
      expect(e.index, type).toMatch(/^\//);
      expect(e.page, type).toMatch(/:id$/);
      expect(e.page!.startsWith(`${e.index}/`), `${type} page sits under its index`).toBe(true);
    }
  });

  it("recordPath fills and encodes the id, or is null without a page", () => {
    expect(recordPath("request", "r1")).toBeNull();
    expect(recordPath("nope", "r1")).toBeNull();
    for (const [type, e] of resourcePanels) {
      expect(recordPath(type, "a/b c")).toBe(e.page!.replace(":id", "a%2Fb%20c"));
    }
  });

  it("a record page exists and carries its index's middleware", () => {
    for (const [type, e] of resourcePanels) {
      const page = pageFile(e.page!);
      const index = pageFile(e.index!);
      expect(existsSync(page), `${type}: ${page}`).toBe(true);
      expect(existsSync(index), `${type}: ${index}`).toBe(true);
      expect(middlewareOf(page), type).toEqual(middlewareOf(index));
    }
  });

  it("the nav registry gates a record page as it gates the index", () => {
    for (const [type, e] of resourcePanels) {
      const ids = (rel: string) => entriesForPath(rel).map((n) => n.id).sort();
      expect(ids(e.index!).length, `${type}: index is a nav destination`).toBeGreaterThan(0);
      expect(ids(recordPath(type, "x")!), type).toEqual(ids(e.index!));
    }
  });
});
