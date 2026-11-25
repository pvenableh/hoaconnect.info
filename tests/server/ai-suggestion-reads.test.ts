import { describe, it, expect } from "vitest";
import { groundedChips, suggestionSpecs } from "#core/server/utils/ai-suggestion-reads";

describe("suggestionSpecs", () => {
  it("reads a document, a published rule and the latest sent email, as the route did", () => {
    expect(suggestionSpecs("org-1", true)).toEqual({
      sg_chunks: { collection: "ai_doc_chunks", filter: { organization: { _eq: "org-1" } }, fields: ["source_title"], limit: 25 },
      sg_rules: {
        collection: "hoa_governance",
        filter: { organization: { _eq: "org-1" }, status: { _eq: "published" } },
        fields: ["title"],
        limit: 1,
      },
      sg_emails: {
        collection: "hoa_emails",
        filter: { organization: { _eq: "org-1" }, status: { _eq: "sent" } },
        fields: ["subject"],
        sort: ["-sent_at"],
        limit: 1,
      },
    });
  });

  it("leaves the document read out without RAG", () => {
    expect(Object.keys(suggestionSpecs("org-1", false))).toEqual(["sg_rules", "sg_emails"]);
  });
});

describe("groundedChips", () => {
  it("builds the chips in order, clipping long titles", () => {
    const long = "x".repeat(80);
    expect(
      groundedChips({
        chunks: [{ source_title: null }, { source_title: "Bylaws" }, { source_title: "Rules" }],
        rules: [{ title: `  Pets\n and   noise ${long}` }],
        emails: [{ subject: long }],
      })
    ).toEqual([
      "Summarize “Bylaws”",
      `What do our rules say about ${`Pets and noise ${long}`.slice(0, 48)}…?`,
      `What was “${long.slice(0, 72)}…” about?`,
    ]);
  });

  it("adds nothing for a read that did not run, failed or found nothing", () => {
    expect(groundedChips({})).toEqual([]);
    expect(groundedChips({ chunks: [], rules: [{ title: "" }], emails: [{ subject: null }] })).toEqual([]);
  });
});
