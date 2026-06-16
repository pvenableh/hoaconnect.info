import { describe, it, expect } from "vitest";
import { splitDraftOutput } from "~~/shared/ai/draft";

describe("splitDraftOutput", () => {
  it("returns all-body, null subject while the first line is still arriving", () => {
    expect(splitDraftOutput("Subj")).toEqual({ subject: null, body: "Subj" });
  });

  it("parses a subject the moment the prefix is present on the first line", () => {
    expect(splitDraftOutput("Subject: Pool closing")).toEqual({
      subject: "Pool closing",
      body: "",
    });
  });

  it("splits subject and HTML body across the blank line", () => {
    const full = "Subject: Pool closed this weekend\n\n<p>Hi neighbors,</p><p>The pool…</p>";
    expect(splitDraftOutput(full)).toEqual({
      subject: "Pool closed this weekend",
      body: "<p>Hi neighbors,</p><p>The pool…</p>",
    });
  });

  it("trims the subject and strips leading blank lines from the body", () => {
    const full = "Subject:   Dues reminder  \n\n\n<p>Body</p>";
    expect(splitDraftOutput(full)).toEqual({ subject: "Dues reminder", body: "<p>Body</p>" });
  });

  it("treats output with no Subject marker as all body", () => {
    const full = "<p>Just a body</p>\n<p>second line</p>";
    expect(splitDraftOutput(full)).toEqual({ subject: null, body: full });
  });

  it("is case-insensitive on the Subject prefix", () => {
    expect(splitDraftOutput("subject: hi\n\n<p>x</p>")).toEqual({
      subject: "hi",
      body: "<p>x</p>",
    });
  });
});
