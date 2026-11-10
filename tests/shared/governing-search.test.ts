import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCitation } from "#core/shared/governing/citation";
import { RELATIONSHIP_ORDER, sortFlags } from "#core/shared/governing/flags";
import { citationNumber, normalizeCitation, searchProvisions } from "#core/shared/governing/search";
import type { GovDocument, GovFlag, GovProvision, GovSnapshot } from "#core/shared/governing/types";
import { visibleSnapshot } from "#core/shared/governing/visibility";
import { buildImportPlan } from "../../scripts/lib/governing-import";

// The real 1033 Lenox seed, shaped as the server hands it to search. Acceptance
// criterion 2 (spec §9) names these provisions, so the test runs on them.
const SEED = resolve(__dirname, "../../docs/governing-docs/seed");
const json = (f: string) => JSON.parse(readFileSync(resolve(SEED, f), "utf8"));
const plan = buildImportPlan(json("manifest.json"), json("provisions.json"), json("statute_flags.json"));

const snapshot: GovSnapshot = {
  documents: plan.documents.map((d) => ({ ...(d.data as any), id: d.key, amends: d.amendsKey }) as GovDocument),
  provisions: plan.provisions.map((p) => ({ ...(p.data as any), id: p.key, document: p.documentKey, parent: p.parentKey }) as GovProvision),
  links: [],
  sources: [],
  flags: plan.flags.map((f) => ({ ...(f.data as any), id: f.key, provisions: f.provisionKeys, references: [] }) as GovFlag),
};
const ids = (q: string, filters = {}) => searchProvisions(snapshot, q, filters).map((h) => h.provision.id);

describe("governing search — ranking on the Lenox documents (criterion 2)", () => {
  it('"proxies" returns By-Law 3.5 first', () => {
    expect(ids("proxies")[0]).toBe("bylaws:3.5");
    expect(ids("Proxies")[0]).toBe("bylaws:3.5");
  });

  it('"By-Law 6.5" and "fidelity" return the fidelity bond provision first', () => {
    expect(ids("By-Law 6.5")[0]).toBe("bylaws:6.5");
    expect(ids("fidelity")[0]).toBe("bylaws:6.5");
  });

  it("finds a citation however it is typed", () => {
    for (const q of ["by-law 3.5", "BY-LAW 3.5", "bylaw 3.5", "By Law 3.5"]) expect(ids(q)[0]).toBe("bylaws:3.5");
    expect(ids("Decl. 11.1")[0]).toBe("decl:11.1");
    expect(ids("decl 11.1")[0]).toBe("decl:11.1");
  });

  it('a bare "3.5" returns every document\'s 3.5 before anything else, in document order', () => {
    expect(ids("3.5").slice(0, 2)).toEqual(["decl:3.5", "bylaws:3.5"]);
  });

  it('"By-Law 3" leads with section 3 and then its sub-sections, not By-Law 30 or 13', () => {
    const top = ids("By-Law 3");
    expect(top[0]).toBe("bylaws:3");
    expect(top.slice(1, 9).every((id) => id.startsWith("bylaws:3."))).toBe(true);
  });

  it("ranks a heading match above a text-only match", () => {
    const hits = searchProvisions(snapshot, "proxies");
    expect(hits[0]!.matched).toBe("heading");
    expect(hits.slice(1).every((h) => h.matched === "text")).toBe(true);
  });

  it("gives a text match an excerpt that is a verbatim slice of the provision", () => {
    const hit = searchProvisions(snapshot, "Poxies").find((h) => h.provision.id === "bylaws:3.5")!;
    expect(hit.matched).toBe("text");
    expect(hit.excerpt!.text).toContain("Poxies may be made by any person");
    expect(hit.provision.text).toContain(hit.excerpt!.text);
  });

  it("returns nothing for an empty or one-letter query without filters", () => {
    expect(ids("")).toEqual([]);
    expect(ids("a")).toEqual([]);
  });
});

describe("governing search — filters", () => {
  it("narrows by document and by kind", () => {
    expect(ids("lease", { document: "amend-1994" }).every((id) => id.startsWith("amend-1994:"))).toBe(true);
    expect(ids("3.5", { kind: "bylaws" })).toEqual(["bylaws:3.5"]);
  });

  it("filters alone list every provision carrying such a flag", () => {
    const counsel = ids("", { relationship: "counsel_review" });
    const expected = new Set(snapshot.flags.filter((f) => f.relationship === "counsel_review").flatMap((f) => f.provisions));
    expect(new Set(counsel)).toEqual(expected);
    expect(ids("", { hasFlags: true }).length).toBe(new Set(snapshot.flags.flatMap((f) => f.provisions)).size);
    expect(ids("fidelity", { severity: "high" })).toEqual(["bylaws:6.5"]);
    expect(ids("fidelity", { relationship: "consistent" })).toEqual([]);
  });
});

describe("governing search — helpers", () => {
  it("normalizes citations for comparison only", () => {
    expect(normalizeCitation("By-Law 3.5")).toBe("bylaw 3.5");
    expect(normalizeCitation("Decl. 12.3")).toBe("decl 12.3");
    expect(normalizeCitation("1978 Amend. ¶7")).toBe("1978 amend ¶7");
    expect(citationNumber("By-Law 3.5")).toBe("3.5");
    expect(citationNumber("1994 Amend. certificate")).toBeNull();
  });

  it("formats the copy-citation string as the spec gives it", () => {
    const provision = snapshot.provisions.find((p) => p.id === "bylaws:3.5")!;
    const document = snapshot.documents.find((d) => d.id === "bylaws")!;
    expect(formatCitation(provision, document)).toBe("By-Law 3.5, O.R. Book 9640, Page 300");
  });

  it("puts counsel_review first", () => {
    expect(RELATIONSHIP_ORDER[0]).toBe("counsel_review");
    expect(sortFlags(snapshot.flags)[0]!.relationship).toBe("counsel_review");
  });
});

describe("governing visibility (criterion 7, the rule itself)", () => {
  const mixed: GovSnapshot = {
    documents: [
      { ...snapshot.documents[0]!, id: "pub", status: "published" },
      { ...snapshot.documents[0]!, id: "draft", status: "draft" },
      { ...snapshot.documents[0]!, id: "review", status: "in_review" },
    ],
    provisions: [
      { ...snapshot.provisions[0]!, id: "p-pub", document: "pub", review_state: "reviewed" },
      { ...snapshot.provisions[0]!, id: "p-ocr", document: "pub", review_state: "ocr_draft" },
      { ...snapshot.provisions[0]!, id: "p-draft", document: "draft", review_state: "reviewed" },
      { ...snapshot.provisions[0]!, id: "p-review", document: "review", review_state: "verified" },
    ],
    links: [
      { id: "l1", from_provision: "p-draft", to_provision: "p-pub", type: "amends", note: null },
      { id: "l2", from_provision: "p-pub", to_provision: "p-pub", type: "adds_to", note: null },
    ],
    flags: (["confirmed", "counsel_confirmed", "suggested", "dismissed"] as const).map((status) => ({
      ...snapshot.flags[0]!,
      id: `f-${status}`,
      status,
      provisions: ["p-pub", "p-draft"],
    })),
    sources: ["pub", "draft", "review"].map((document) => ({
      id: `s-${document}`, document, file: `file-${document}`, filename: "scan.pdf", type: "application/pdf", filesize: 1,
      is_recorded_copy: document !== "pub", is_authoritative: false, notes: null, page_count: 1, date_created: null,
    })),
  };

  it("a member gets published documents, reviewed provisions and confirmed flags only", () => {
    const seen = visibleSnapshot(mixed, false);
    expect(seen.documents.map((d) => d.id)).toEqual(["pub"]);
    expect(seen.provisions.map((p) => p.id)).toEqual(["p-pub"]);
    expect(seen.links.map((l) => l.id)).toEqual(["l2"]);
    expect(seen.flags.map((f) => f.id)).toEqual(["f-confirmed", "f-counsel_confirmed"]);
    expect(seen.flags.every((f) => f.provisions.join() === "p-pub")).toBe(true);
    // Every original of a published document, recorded copy or not; none of a draft's.
    expect(seen.sources.map((s) => s.id)).toEqual(["s-pub"]);
  });

  it("drops a confirmed flag whose provisions are all hidden", () => {
    const onlyDraft = { ...mixed, flags: [{ ...mixed.flags[0]!, provisions: ["p-draft"] }] };
    expect(visibleSnapshot(onlyDraft, false).flags).toEqual([]);
  });

  it("a manager gets everything", () => {
    expect(visibleSnapshot(mixed, true)).toBe(mixed);
  });
});
