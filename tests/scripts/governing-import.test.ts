import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  C,
  LENOX_PROVISION_LINKS,
  applyImportPlan,
  buildImportPlan,
  parentKeyFor,
  sourceFor,
  splitStatuteRef,
  transcriberNotes,
  type ImportStore,
  type SeedFlagsFile,
  type SeedManifest,
  type SeedProvision,
} from "../../scripts/lib/governing-import";

// The real seed, read as data. Acceptance criteria 1 and 3 (spec §9) are about
// these exact files, so the tests run on them rather than on a fixture.
const SEED = resolve(__dirname, "../../docs/governing-docs/seed");
const read = (f: string) => readFileSync(resolve(SEED, f), "utf8");
const manifest = JSON.parse(read("manifest.json")) as SeedManifest;
const provisionsRaw = read("provisions.json");
const provisions = JSON.parse(provisionsRaw) as SeedProvision[];
const flagsFile = JSON.parse(read("statute_flags.json")) as SeedFlagsFile;

const ORG = "org-1";
const plan = () => buildImportPlan(manifest, provisions, flagsFile, { links: LENOX_PROVISION_LINKS });

function memoryStore() {
  const rows = new Map<string, Array<Record<string, unknown> & { id: string }>>();
  const writes = { create: 0, update: 0 };
  let n = 0;
  const table = (c: string) => rows.get(c) ?? rows.set(c, []).get(c)!;
  const store: ImportStore = {
    async findOne(c, match) {
      return table(c).find((r) => Object.entries(match).every(([k, v]) => r[k] === v)) ?? null;
    },
    async create(c, data) {
      writes.create++;
      const id = `id-${++n}`;
      table(c).push({ ...data, id });
      return id;
    },
    async update(c, id, data) {
      writes.update++;
      Object.assign(table(c).find((r) => r.id === id)!, data);
    },
  };
  return { store, table, writes };
}

describe("governing-documents seed plan", () => {
  it("maps the seed to 7 documents, 209 provisions and 43 flags", () => {
    const p = plan();
    expect(p.documents).toHaveLength(7);
    expect(p.provisions).toHaveLength(209);
    expect(p.flags).toHaveLength(43);
    expect(new Set(p.flags.map((f) => f.key)).size).toBe(43);
  });

  it("passes every provision's text through byte for byte", () => {
    const p = plan();
    for (const [i, row] of p.provisions.entries()) expect(row.data.text).toBe(provisions[i]!.text);
  });

  it("keeps By-Law 3.5 exactly as recorded, typo included (criterion 3)", () => {
    const row = plan().provisions.find((p) => p.key === "bylaws:3.5")!;
    expect(row.data.citation).toBe("By-Law 3.5");
    expect(row.data.text).toBe(
      ".5 Proxies. Votes may be cast in person or by proxy. Poxies may be made by any person entitled to vote and shall be valid only for the particular meeting designated therein and must be filed with the Secretary before the appointed time of the meeting or any adjournment thereof. No one person may be designated to hold more than five (5) proxies."
    );
    // And the literal is not a retyping of the seed: the file holds the same bytes.
    expect(provisionsRaw).toContain(JSON.stringify(row.data.text));
  });

  it("imports provisions as reviewed, not verified, and flags as curated", () => {
    const p = plan();
    expect(new Set(p.provisions.map((x) => x.data.review_state))).toEqual(new Set(["reviewed"]));
    expect(new Set(p.flags.map((x) => x.data.origin))).toEqual(new Set(["curated"]));
    expect(new Set(p.flags.map((x) => x.data.status))).toEqual(new Set(["confirmed"]));
  });

  it("copies the flag rules and the citation without rewording", () => {
    const p = plan();
    for (const [i, f] of p.flags.entries()) {
      const seed = flagsFile.flags[i]!;
      expect(f.data.statute_rule).toBe(seed.statute_rule);
      expect(f.data.document_rule).toBe(seed.document_rule);
      expect(f.data.statute_citation).toBe(seed.statute_ref);
      expect(f.data.relationship).toBe(seed.relationship);
    }
  });

  it("gives By-Law 6.5 a statute_controls flag citing 718.111(11)(h) with the seed's URL and edition", () => {
    const p = plan();
    const flag = p.flags.find((f) => f.provisionKeys.includes("bylaws:6.5"))!;
    expect(flag.data.relationship).toBe("statute_controls");
    expect(flag.referenceCodes).toEqual(["718.111(11)(h)"]);
    const ref = p.references.find((r) => r.code === "718.111(11)(h)")!;
    expect(ref.data.url).toBe(flagsFile._meta.sources["718.111"]!.url);
    expect(ref.data.edition).toBe(flagsFile._meta.sources["718.111"]!.edition);
    expect(ref.data.title).toBeNull();
    expect(ref.data.summary).toBeNull();
  });

  it("invents no statute reference: every code is a piece of a seed statute_ref", () => {
    const seedPieces = new Set(flagsFile.flags.flatMap((f) => (f.statute_ref ?? "").split(";").map((s) => s.trim())).filter(Boolean));
    for (const r of plan().references) expect(seedPieces.has(r.code)).toBe(true);
  });

  it("links amendments to the Declaration and the two named provision pairs (criterion 6)", () => {
    const p = plan();
    expect(p.documents.filter((d) => d.amendsKey === "decl").map((d) => d.key)).toEqual(["amend-1978", "amend-1994", "amend-1995"]);
    expect(p.links).toContainEqual({ from: "amend-1978:¶7", to: "decl:11", type: "amends", note: null });
    expect(p.links.find((l) => l.type === "conflicts_with")).toMatchObject({ from: "amend-1978:¶6", to: "amend-1994:¶1" });
  });

  it("refuses a seed that points at something missing", () => {
    const bad = { ...flagsFile, flags: [{ ...flagsFile.flags[0]!, provision_ids: ["bylaws:99.9"] }] };
    expect(() => buildImportPlan(manifest, provisions, bad)).toThrow(/unknown provision bylaws:99\.9/);
  });
});

describe("governing-documents seed helpers", () => {
  it("splits a compound statute_ref and leaves the pieces alone", () => {
    expect(splitStatuteRef("718.112(2)(k); 718.111(14)")).toEqual(["718.112(2)(k)", "718.111(14)"]);
    expect(splitStatuteRef(null)).toEqual([]);
  });

  it("finds a source by section or by name, and nothing otherwise", () => {
    const sources = { "718.111": { url: "u1", edition: "2026" }, tropicana: { url: "u2", edition: "e" } };
    expect(sourceFor("718.111(11)(h)", sources)?.url).toBe("u1");
    expect(sourceFor("Tropicana Condo. Ass'n v. X", sources)?.url).toBe("u2");
    expect(sourceFor("720.303", sources)).toBeNull();
  });

  it("derives a parent only from the id, and only when it exists", () => {
    const ids = new Set(["decl:11", "decl:11.1", "bylaws:3.5"]);
    expect(parentKeyFor("decl:11.1", ids)).toBe("decl:11");
    expect(parentKeyFor("bylaws:3.5", ids)).toBeNull();
    expect(parentKeyFor("decl:11", ids)).toBeNull();
  });

  it("takes transcriber's notes as a verbatim slice", () => {
    const md = "# Title\n\nBody  text\n\n## Transcriber's notes\n\n- one\n";
    expect(transcriberNotes(md)).toBe("## Transcriber's notes\n\n- one\n");
    expect(transcriberNotes("# Title\n")).toBeNull();
  });
});

describe("governing-documents seed import", () => {
  it("is idempotent: a second run creates and changes nothing (criterion 1)", async () => {
    const { store, table, writes } = memoryStore();
    const first = await applyImportPlan(store, ORG, plan());
    expect(table(C.documents)).toHaveLength(7);
    expect(table(C.provisions)).toHaveLength(209);
    expect(table(C.flags)).toHaveLength(43);
    expect(first.stats[C.provisions]).toEqual({ created: 209, updated: 0, unchanged: 0 });
    const sizes = Object.values(C).map((c) => table(c).length);
    const snapshot = JSON.stringify(Object.values(C).map((c) => table(c)));
    const createsAfterFirst = writes.create;
    const updatesAfterFirst = writes.update;

    const second = await applyImportPlan(store, ORG, plan());
    expect(Object.values(C).map((c) => table(c).length)).toEqual(sizes);
    expect(writes.create).toBe(createsAfterFirst);
    expect(writes.update).toBe(updatesAfterFirst);
    expect(JSON.stringify(Object.values(C).map((c) => table(c)))).toBe(snapshot);
    expect(second.stats[C.provisions]).toEqual({ created: 0, updated: 0, unchanged: 209 });
    expect(second.textDiffers).toEqual([]);
  });

  it("stores relations by id: document, parent, amends, flag junctions", async () => {
    const { store, table } = memoryStore();
    await applyImportPlan(store, ORG, plan());
    const doc = (key: string) => table(C.documents).find((d) => d.source_key === key)!;
    const prov = (key: string) => table(C.provisions).find((p) => p.source_key === key)!;
    expect(doc("amend-1978").amends).toBe(doc("decl").id);
    expect(doc("decl").amends ?? null).toBeNull();
    expect(prov("bylaws:3.5").document).toBe(doc("bylaws").id);
    expect(prov("decl:11.1").parent).toBe(prov("decl:11").id);
    expect(table(C.links)).toHaveLength(2);
    const expectedJunctions = flagsFile.flags.reduce((n, f) => n + f.provision_ids.length, 0);
    expect(table(C.flagProvisions)).toHaveLength(expectedJunctions);
    expect(table(C.documents).every((d) => d.organization === ORG)).toBe(true);
  });

  it("never overwrites provision text or an admin's statuses on a re-run (criterion 8)", async () => {
    const { store, table } = memoryStore();
    await applyImportPlan(store, ORG, plan());
    const provision = table(C.provisions).find((p) => p.source_key === "bylaws:3.5")!;
    provision.text = "edited through the audited route";
    provision.review_state = "verified";
    const flag = table(C.flags)[0]!;
    flag.status = "counsel_confirmed";

    const again = await applyImportPlan(store, ORG, plan());
    expect(provision.text).toBe("edited through the audited route");
    expect(provision.review_state).toBe("verified");
    expect(flag.status).toBe("counsel_confirmed");
    expect(again.textDiffers).toEqual(["bylaws:3.5"]);
  });
});
