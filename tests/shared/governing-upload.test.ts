/**
 * Governing documents: the proposal rule and the upload limits (Session 3A).
 * Pure: page text in, draft pieces out. Every piece is an exact slice.
 */
import { describe, it, expect } from "vitest";
import { UPLOAD_PART_BYTES, UPLOAD_PART_MAX_BYTES, hasUsableTextLayer, looksBlank, textLayerNoise, partCount, proposeProvisions } from "#core/shared/governing/upload";

const PAGE_1 = "BY-LAWS OF LENOX PLAZA\n\nARTICLE III\nMEETINGS\n\n.4  Notice shall be given.\n.5  Poxies shall be in writing  \nand filed with the Secretary.\n\n";
const PAGE_2 = "which continues from the page before, with no heading at all.\n";
const PAGE_3 = "Section 2. Quorum.\n   (a) A majority.\n1. First item\nIV. Roman heading\n";

const pages = [
  { source: "s1", page_number: 1, text: PAGE_1 },
  { source: "s1", page_number: 2, text: PAGE_2 },
  { source: "s1", page_number: 3, text: PAGE_3 },
  { source: "s1", page_number: 4, text: "   \n" },
  { source: "s1", page_number: 5, text: null },
];

describe("proposing provisions from page text", () => {
  const proposed = proposeProvisions(pages);

  it("joined back together, the pieces of a page are that page's text exactly", () => {
    for (const page of pages.slice(0, 3)) {
      expect(proposed.filter((p) => p.page_number === page.page_number).map((p) => p.text).join("")).toBe(page.text);
    }
  });

  it("cuts at headings and keeps the label as printed", () => {
    expect(proposed.filter((p) => p.page_number === 1).map((p) => p.original_label)).toEqual([null, "ARTICLE III", ".4", ".5"]);
    expect(proposed.filter((p) => p.page_number === 3).map((p) => p.original_label)).toEqual(["Section 2", "(a)", "1.", "IV."]);
  });

  it("keeps an original misspelling and trailing spaces", () => {
    expect(proposed.find((p) => p.original_label === ".5")!.text).toBe(".5  Poxies shall be in writing  \nand filed with the Secretary.\n\n");
  });

  it("makes one piece of a page with no heading, and none of an empty page", () => {
    expect(proposed.filter((p) => p.page_number === 2)).toEqual([expect.objectContaining({ text: PAGE_2, original_label: null })]);
    expect(proposed.some((p) => p.page_number > 3)).toBe(false);
  });

  it("numbers the pieces in reading order with keys that name the page", () => {
    expect(proposed.map((p) => p.sort)).toEqual(proposed.map((_, i) => i + 1));
    expect(new Set(proposed.map((p) => p.source_key)).size).toBe(proposed.length);
    expect(proposed[0]!.source_key).toBe("upload:s1:1:1");
    expect(proposed.every((p) => p.source_key.length <= 128)).toBe(true);
  });
});

describe("upload limits", () => {
  it("a part fits a single request with room to spare", () => {
    expect(UPLOAD_PART_BYTES).toBeLessThan(UPLOAD_PART_MAX_BYTES);
    expect(UPLOAD_PART_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
  it("counts parts", () => {
    expect(partCount(1)).toBe(1);
    expect(partCount(UPLOAD_PART_BYTES)).toBe(1);
    expect(partCount(UPLOAD_PART_BYTES + 1)).toBe(2);
  });
  it("sees a page that came out white, so no credits are spent reading it", () => {
    const white = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    expect(looksBlank(white)).toBe(true);
    // One dark pixel on the sampled grid is enough to say the page has something on it.
    const marked = white.slice();
    marked[0] = 0;
    marked[1] = 0;
    marked[2] = 0;
    expect(looksBlank(marked)).toBe(false);
    expect(looksBlank(new Uint8ClampedArray(0))).toBe(true);
  });
  it("does not trust a text layer riddled with an old pass's garbled marks over reading the image", () => {
    // From the 1977 typescript's own text layer (page 12), as the file gives it.
    const poor = [
      'EXHIBIT "D"', "BY-LAWS", "OF", "LENOX PLAZA ASSOCIATION, INC. ,", "A CONDOMINIUM",
      'l. Identity. These are the By-Laws of LENOX PLAZA ASSOCIATION, INC., herein called "Association",\u00b7 a non',
      "profit Florida Corporation organized pursuant to Chapters",
      "617 and 711, Florida Statutes for the purpose of admini\uFFFDterinq",
      "LENOX:PLAZA ASSOCIATION, INC., a Condominium, being a",
      "Condominium of lands lying and being situate in Dade County,",
      "Florida, as more particularly set forth in its Declaration of Condominium.",
      "_3 Voting Rights. There shall be assigned to each unit one vote",
      "l!D<ZNS J. n:rss, AT!01911!Y AT LAW, 407 Lincoln M., IUaai Baach, Plorlda 33139",
    ].join("\r\n");
    expect(textLayerNoise(poor).garbled).toBeGreaterThanOrEqual(3);
    expect(hasUsableTextLayer(poor)).toBe(false);
  });
  it("keeps a clean text layer, including the marks ordinary legal text has", () => {
    const clean =
      "1. Identity. These are the By-Laws of the Association, e.g. the U.S. rules; the annual meeting is at 7:30 p.m. on Dec. 3. " +
      "Notice (see Section 4.2(a)) shall be given at least fourteen (14) days before, at a cost of $25.00 or 5% of dues; " +
      "see http://example.org/rules and Article IV, paragraph 3 of the Declaration of Condominium of the building.";
    expect(textLayerNoise(clean).garbled).toBe(0);
    expect(hasUsableTextLayer(clean)).toBe(true);
    // One stray mark in a long page is not enough to throw the layer away.
    expect(hasUsableTextLayer(`${clean} ${"The members shall meet in January. ".repeat(40)}a\uFFFDb`)).toBe(true);
  });
  it("a scan's stray marks are not a text layer", () => {
    expect(hasUsableTextLayer(" . \n 3006 ")).toBe(false);
    expect(hasUsableTextLayer("The annual meeting of the members shall be held in January.")).toBe(true);
    expect(hasUsableTextLayer(null)).toBe(false);
  });
});
