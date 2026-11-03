import { describe, it, expect } from "vitest";
import { CREATE_VERBS, createVerb, matchVerbs, visibleVerbs } from "#core/shared/create-verbs";
import { ADMIN_SECTION_LINKS } from "#core/app/composables/useSectionNav";

const allOn = () => true;
const off = (...keys: string[]) => (m: string) => !keys.includes(m);

// The gate is the point of the registry: a verb on a global surface (the Nav's
// "+ New", Spotlight) is only as safe as the check that decides who sees it.
describe("visibleVerbs — the one gate", () => {
  it("offers nothing to a viewer who is not an admin of this org", () => {
    expect(visibleVerbs({ isAdmin: false, isEnabled: allOn })).toEqual([]);
  });

  it("offers every verb to an admin with every module on, in registry order", () => {
    expect(visibleVerbs({ isAdmin: true, isEnabled: allOn }).map((v) => v.id)).toEqual(
      CREATE_VERBS.map((v) => v.id)
    );
  });

  it("drops a verb whose module is switched off", () => {
    const ids = visibleVerbs({ isAdmin: true, isEnabled: off("directory", "polls") }).map((v) => v.id);
    expect(ids).not.toContain("member");
    expect(ids).not.toContain("unit");
    expect(ids).not.toContain("poll");
    expect(ids).toContain("meeting");
  });
});

describe("registry shape", () => {
  it("a ?new= runner names its own verb, so the page's useCreateIntent finds it", () => {
    for (const v of CREATE_VERBS) {
      const q = new URLSearchParams(v.to.split("?")[1] ?? "");
      if (q.has("new")) expect(q.get("new")).toBe(v.id);
    }
  });

  it("every runner lands on a page a section or the member dock already routes to", () => {
    const known = Object.values(ADMIN_SECTION_LINKS)
      .flat()
      .map((l) => l.path.split("?")[0]);
    for (const v of CREATE_VERBS) {
      const path = v.to.split("?")[0];
      expect(known.some((k) => path === k || path.startsWith(`${k}/`)), `${v.id} → ${path}`).toBe(true);
    }
  });

  it("labels are Title Case actions", () => {
    for (const v of CREATE_VERBS) expect(v.label).toMatch(/^([A-Z][a-z]*)( [A-Z][a-z]*)+$/);
  });

  it("createVerb throws on an unknown id", () => {
    expect(() => createVerb("nope" as never)).toThrow();
  });
});

describe("matchVerbs — Spotlight", () => {
  const all = visibleVerbs({ isAdmin: true, isEnabled: allOn });

  it("matches nothing for an empty query", () => {
    expect(matchVerbs("  ", all)).toEqual([]);
  });

  it('"new" lists every verb', () => {
    expect(matchVerbs("new", all)).toHaveLength(all.length);
  });

  it("matches a noun, a prefix, and an alias", () => {
    expect(matchVerbs("new meet", all).map((v) => v.id)).toEqual(["meeting"]);
    expect(matchVerbs("uni", all).map((v) => v.id)).toEqual(["unit"]);
    expect(matchVerbs("dues", all).map((v) => v.id)).toEqual(["charge"]);
    expect(matchVerbs("upload", all).map((v) => v.id)).toEqual(["document"]);
  });

  it("never matches a verb the gate removed", () => {
    const some = visibleVerbs({ isAdmin: true, isEnabled: off("payments") });
    expect(matchVerbs("dues", some)).toEqual([]);
  });
});
