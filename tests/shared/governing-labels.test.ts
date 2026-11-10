// Display helpers for the governing-documents pages (Session 1C).
// The one that touches provision text, splitHighlight, must never change it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatBookAndPage,
  formatRecordDate,
  kindLabel,
  linkLabel,
  provisionDepths,
  splitHighlight,
} from "../../core/shared/governing/labels";

const seed = JSON.parse(readFileSync("docs/governing-docs/seed/provisions.json", "utf8")) as Array<{ id: string; text: string }>;

describe("splitHighlight", () => {
  it("joins back to the exact text for every seed provision", () => {
    for (const p of seed) {
      for (const q of ["proxies", "the", "By-Law", " ", "§"]) {
        expect(splitHighlight(p.text, q).map((x) => x.text).join("")).toBe(p.text);
      }
    }
  });

  it("marks matches without correcting the words around them", () => {
    const text = seed.find((p) => p.id === "bylaws:3.5")!.text;
    const parts = splitHighlight(text, "proxies");
    expect(parts.filter((x) => x.match).map((x) => x.text)).toEqual(["Proxies", "proxies"]);
    expect(parts.map((x) => x.text).join("")).toContain("Poxies");
  });

  it("returns the text unmarked for an empty query", () => {
    expect(splitHighlight("Abc", "  ")).toEqual([{ text: "Abc", match: false }]);
    expect(splitHighlight("", "a")).toEqual([]);
  });
});

describe("labels", () => {
  it("formats a stored date without shifting the day", () => {
    expect(formatRecordDate("1977-03-01")).toBe("March 1, 1977");
    expect(formatRecordDate(null)).toBe("");
    expect(formatRecordDate("not a date")).toBe("");
  });

  it("formats book and page", () => {
    expect(formatBookAndPage("9640", 300, 301)).toBe("O.R. Book 9640, Pages 300–301");
    expect(formatBookAndPage("9640", 300, 300)).toBe("O.R. Book 9640, Page 300");
    expect(formatBookAndPage(null, 12, null)).toBe("Page 12");
    expect(formatBookAndPage(null, null, null)).toBe("");
  });

  it("shows an unknown kind as stored", () => {
    expect(kindLabel("bylaws")).toBe("By-laws");
    expect(kindLabel("easement")).toBe("easement");
  });

  it("reads a link from either end", () => {
    expect(linkLabel("amends", "from")).toBe("Amends");
    expect(linkLabel("amends", "to")).toBe("Amended by");
    expect(linkLabel("conflicts_with", "from")).toBe(linkLabel("conflicts_with", "to"));
  });

  it("measures depth and survives a parent loop", () => {
    const depths = provisionDepths([
      { id: "a", parent: null },
      { id: "b", parent: "a" },
      { id: "c", parent: "b" },
      { id: "x", parent: "y" },
      { id: "y", parent: "x" },
      { id: "z", parent: "missing" },
    ]);
    expect([depths.get("a"), depths.get("b"), depths.get("c"), depths.get("z")]).toEqual([0, 1, 2, 0]);
    expect(depths.get("x")).toBe(1);
  });
});
