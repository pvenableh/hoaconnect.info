/**
 * Governing documents: the review rules (Session 3B). Pure functions; the
 * routes that enforce them are in tests/server/governing-review.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  asShownInTextBox,
  canPublish,
  countMarkers,
  findMarkers,
  hasBlockingMarker,
  mergeText,
  parseUploadKey,
  publishBlockers,
  splitAtMarkers,
  splitText,
  storedOffset,
} from "#core/shared/governing/review";

const TEXT = "Signed [illegible] President\r\n[signature]  [seal] [stamp: x] [illegible]\n";

describe("OCR markers", () => {
  it("finds every marker in order and counts them; other brackets are not markers", () => {
    expect(findMarkers(TEXT).map((m) => m.marker)).toEqual(["[illegible]", "[signature]", "[seal]", "[illegible]"]);
    expect(countMarkers(TEXT)).toEqual({ "[illegible]": 2, "[signature]": 1, "[seal]": 1, "[drawing]": 0 });
    expect(countMarkers(null)).toEqual({ "[illegible]": 0, "[signature]": 0, "[seal]": 0, "[drawing]": 0 });
  });

  it("only [illegible] blocks review", () => {
    expect(hasBlockingMarker(TEXT)).toBe(true);
    expect(hasBlockingMarker("[signature] [seal] [drawing]")).toBe(false);
  });

  it("cutting at markers loses nothing", () => {
    const parts = splitAtMarkers(TEXT);
    expect(parts.map((p) => p.text).join("")).toBe(TEXT);
    expect(parts.filter((p) => p.marker)).toHaveLength(4);
  });
});

describe("split and merge", () => {
  it("a split's pieces joined are the text, at every cut", () => {
    for (let at = 1; at < TEXT.length; at++) {
      const pieces = splitText(TEXT, at)!;
      expect(mergeText(pieces[0], pieces[1])).toBe(TEXT);
    }
  });

  it("refuses a cut that leaves an empty piece or is not a whole number", () => {
    for (const at of [0, TEXT.length, -3, 1.5, Number.NaN]) expect(splitText(TEXT, at)).toBeNull();
  });
});

describe("the text box", () => {
  it("maps a cursor position in the box back to the stored text across a CRLF", () => {
    const shown = asShownInTextBox(TEXT);
    expect(shown).not.toContain("\r");
    for (let at = 0; at <= shown.length; at++) {
      const stored = storedOffset(TEXT, at);
      expect(asShownInTextBox(TEXT.slice(0, stored))).toBe(shown.slice(0, at));
      // Never a cut between the \r and the \n.
      expect(TEXT.slice(stored - 1, stored + 1)).not.toBe("\r\n");
    }
  });
});

describe("where a draft provision came from", () => {
  it("reads the source and page from an upload key, also after a split", () => {
    expect(parseUploadKey("upload:src-1:12:3")).toEqual({ source: "src-1", page_number: 12 });
    expect(parseUploadKey("upload:src-1:12:3:sabc")).toEqual({ source: "src-1", page_number: 12 });
  });
  it("is null for an imported provision", () => {
    for (const key of ["bylaws:3.5", null, "", "upload:src:x:1", "upload::1:1"]) expect(parseUploadKey(key)).toBeNull();
  });
});

describe("the publish gate", () => {
  it("needs at least one provision, all reviewed, none with [illegible]", () => {
    expect(canPublish(publishBlockers([]))).toBe(false);
    expect(canPublish(publishBlockers([{ text: "a", review_state: "reviewed" }, { text: "b", review_state: "ocr_draft" }]))).toBe(false);
    expect(canPublish(publishBlockers([{ text: "a [illegible]", review_state: "reviewed" }]))).toBe(false);
    expect(canPublish(publishBlockers([{ text: "a [seal]", review_state: "reviewed" }, { text: "b", review_state: "verified" }]))).toBe(true);
  });
});
