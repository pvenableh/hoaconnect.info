/**
 * The governing reads as one batch (governing-data.ts: governingSpecs and
 * governingFrom). The routes are covered end to end in governing-read.test.ts;
 * these pin the joins the batch now reads through relations.
 */
import { describe, it, expect } from "vitest";
import { governingFrom, governingSpecs, type GoverningRows } from "#core/server/utils/governing-data";

const empty: GoverningRows = {
  gov_documents: [], gov_provisions: [], gov_links: [], gov_flags: [], gov_sources: [], gov_pages: [], gov_flag_provisions: [], gov_flag_references: [],
};

describe("governingSpecs", () => {
  it("reads a flag's joins through the flag's organization, and a source's file and a reference through the relation", () => {
    const s = governingSpecs("org-1");
    expect(s.gov_flag_provisions.filter).toEqual({ flag: { organization: { _eq: "org-1" } } });
    expect(s.gov_flag_references.filter).toEqual({ flag: { organization: { _eq: "org-1" } } });
    expect(s.gov_sources.fields).toEqual(expect.arrayContaining(["file.id", "file.filename_download", "file.type", "file.filesize"]));
    expect(s.gov_sources.fields).not.toContain("file");
    expect(s.gov_flag_references.fields).toEqual(expect.arrayContaining(["reference.id", "reference.checked_on"]));
    // Never a page's extracted text.
    expect(s.gov_pages.fields).not.toContain("text");
  });
});

describe("governingFrom", () => {
  it("takes a source's file details from the related file", () => {
    const snap = governingFrom(
      {
        ...empty,
        gov_documents: [{ id: "d1", status: "published", sort: 1 }],
        gov_sources: [
          { id: "s1", document: "d1", file: { id: "f1", filename_download: "a.pdf", type: "application/pdf", filesize: "2048" }, is_authoritative: true },
          { id: "s2", document: "d1", file: null },
        ],
        gov_pages: [{ id: "p1", source: "s1", page_number: "2", image: "img", extraction: "ocr" }],
      },
      true
    );
    expect(snap.sources).toEqual([
      expect.objectContaining({ id: "s1", file: "f1", filename: "a.pdf", type: "application/pdf", filesize: 2048, is_authoritative: true }),
    ]);
    expect(snap.pages).toEqual([{ id: "p1", source: "s1", document: "d1", page_number: 2, image: "img", extraction: "ocr" }]);
  });

  it("gives each flag its provisions and references in join order, skipping a reference that is gone", () => {
    const snap = governingFrom(
      {
        ...empty,
        gov_flags: [{ id: "fl1", status: "confirmed" }],
        gov_flag_provisions: [
          { flag: "fl1", provision: "p2", sort: 2 },
          { flag: "fl1", provision: "p1", sort: 1 },
        ],
        gov_flag_references: [
          { flag: "fl1", sort: 2, reference: { id: "r2", code: "718.2" } },
          { flag: "fl1", sort: 1, reference: { id: "r1", code: "718.1" } },
          { flag: "fl1", sort: 3, reference: null },
        ],
      },
      true
    );
    expect(snap.flags[0]!.provisions).toEqual(["p1", "p2"]);
    expect(snap.flags[0]!.references.map((r) => r.code)).toEqual(["718.1", "718.2"]);
    expect(Object.keys(snap.flags[0]!.references[0]!)).toEqual(["id", "jurisdiction", "code", "title", "summary", "url", "edition", "checked_on"]);
  });
});
