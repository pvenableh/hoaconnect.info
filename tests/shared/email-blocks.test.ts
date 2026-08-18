import { describe, it, expect } from "vitest";
import {
  extractSlots,
  inferVariablesFromMjml,
  parseVariablesSchema,
  getDefaultVariables,
  substituteBlock,
  assembleMjml,
} from "#core/shared/email/blocks";
import type { HoaNewsletterBlock } from "#core/types/directus";

const hero = {
  id: "b1",
  name: "Hero",
  slug: "sys-hero",
  category: "hero",
  mjml_source: `<mj-section background-color="{{{bg_color}}}"><mj-column><mj-text color="{{{text_color}}}">{{{headline}}}</mj-text></mj-column></mj-section>`,
  variables_schema: [
    { key: "headline", label: "Headline", type: "text", default: "Welcome" },
    { key: "bg_color", label: "Background", type: "color", default: "#1f2937" },
    { key: "text_color", label: "Text color", type: "color", default: "#ffffff" },
  ],
} as unknown as HoaNewsletterBlock;

describe("extractSlots", () => {
  it("returns triple-brace slots in first-seen order, de-duplicated", () => {
    expect(extractSlots("{{{a}}} {{{b}}} {{{a}}}")).toEqual(["a", "b"]);
  });

  it("ignores double-brace merge tokens", () => {
    expect(extractSlots("Hi {{first_name}} — {{{cta}}}")).toEqual(["cta"]);
  });
});

describe("inferVariablesFromMjml", () => {
  it("infers types by key when no schema is given", () => {
    const defs = inferVariablesFromMjml("{{{bg_color}}} {{{link_url}}} {{{hero_image}}} {{{title}}}");
    expect(defs.map((d) => [d.key, d.type])).toEqual([
      ["bg_color", "color"],
      ["link_url", "url"],
      ["hero_image", "image"],
      ["title", "text"],
    ]);
  });
});

describe("parseVariablesSchema", () => {
  it("parses a JSON string schema", () => {
    const defs = parseVariablesSchema('[{"key":"x","label":"X","type":"text"}]');
    expect(defs).toEqual([{ key: "x", label: "X", type: "text", default: "", required: false, description: undefined }]);
  });

  it("falls back to inferring from the MJML when schema is empty", () => {
    const defs = parseVariablesSchema(null, "{{{headline}}}");
    expect(defs[0]!.key).toBe("headline");
  });
});

describe("getDefaultVariables", () => {
  it("seeds each key from its schema default", () => {
    expect(getDefaultVariables(hero)).toEqual({
      headline: "Welcome",
      bg_color: "#1f2937",
      text_color: "#ffffff",
    });
  });
});

describe("substituteBlock", () => {
  it("fills design-time slots and leaves merge tokens intact", () => {
    const block = { ...hero, mjml_source: `<mj-text>{{{headline}}} for {{first_name}}</mj-text>` } as HoaNewsletterBlock;
    const out = substituteBlock(block, { headline: "Notice" });
    expect(out).toBe("<mj-text>Notice for {{first_name}}</mj-text>");
  });

  it("snaps an invalid text color to a readable fallback", () => {
    const block = {
      ...hero,
      mjml_source: `<mj-text color="{{{text_color}}}">hi</mj-text>`,
      variables_schema: [{ key: "text_color", label: "c", type: "color" }],
    } as unknown as HoaNewsletterBlock;
    expect(substituteBlock(block, { text_color: "not-a-color" })).toBe('<mj-text color="#333333">hi</mj-text>');
  });

  it("empties any slot left without a value so MJML stays valid", () => {
    const block = { ...hero, mjml_source: `<mj-text>{{{missing}}}</mj-text>`, variables_schema: [] } as unknown as HoaNewsletterBlock;
    expect(substituteBlock(block, {})).toBe("<mj-text></mj-text>");
  });
});

describe("assembleMjml", () => {
  it("wraps ordered blocks in one <mjml> document", () => {
    const canvas = [
      { instanceId: "1", blockId: "b1", block: hero, variables: getDefaultVariables(hero), sort: 1 },
      { instanceId: "2", blockId: "b1", block: hero, variables: { ...getDefaultVariables(hero), headline: "Second" }, sort: 0 },
    ];
    const out = assembleMjml(canvas, { backgroundColor: "#fff" });
    expect(out.startsWith("<mjml>")).toBe(true);
    expect(out).toContain('background-color="#fff"');
    // sort:0 (Second) renders before sort:1 (Welcome)
    expect(out.indexOf("Second")).toBeLessThan(out.indexOf("Welcome"));
    expect((out.match(/<mj-section/g) || []).length).toBe(2);
  });
});
