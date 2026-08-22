import { describe, it, expect } from "vitest";
import {
  normalizeLandingConfig,
  defaultLandingConfig,
  narrativeSections,
  resolveLocationConfig,
  hasLocationContent,
  NARRATIVE_BLOCK_TYPES,
  BUILTIN_BLOCK_TYPES,
  type LandingConfig,
} from "#core/shared/utils/landing";

describe("normalizeLandingConfig — location & gallery", () => {
  it("defaults location and gallery to null when absent", () => {
    const cfg = normalizeLandingConfig(null);
    expect(cfg.location).toBeNull();
    expect(cfg.gallery).toBeNull();
  });

  it("normalizes a stored location blob, coercing scores and dropping empty highlights", () => {
    const cfg = normalizeLandingConfig({
      location: {
        heading: "On the Park",
        intro: "Steps from everything.",
        walk_score: "94",
        bike_score: 80,
        transit_score: "",
        highlights: [
          { name: "The Beach", walk_time: "6 min", distance: "0.4 mi" },
          { name: "" }, // dropped (no name)
          { walk_time: "x" }, // dropped (no name)
        ],
        stats: [{ value: "12", unit: "min", label: "to the beach" }, { label: "" /* still kept: has label?  */ }],
      },
    });
    expect(cfg.location).not.toBeNull();
    expect(cfg.location!.walk_score).toBe(94);
    expect(cfg.location!.bike_score).toBe(80);
    expect(cfg.location!.transit_score).toBeNull();
    expect(cfg.location!.highlights).toHaveLength(1);
    expect(cfg.location!.highlights[0]).toEqual({
      name: "The Beach",
      walk_time: "6 min",
      distance: "0.4 mi",
    });
    expect(cfg.location!.stats).toHaveLength(1);
  });

  it("coerces gallery source to manual unless explicitly folder, and filters non-string ids", () => {
    const manual = normalizeLandingConfig({ gallery: { source: "weird", images: ["a", 5, null, "b"] } });
    expect(manual.gallery!.source).toBe("manual");
    expect(manual.gallery!.images).toEqual(["a", "b"]);

    const folder = normalizeLandingConfig({ gallery: { source: "folder", folder: "f1" } });
    expect(folder.gallery!.source).toBe("folder");
    expect(folder.gallery!.folder).toBe("f1");
    expect(folder.gallery!.images).toEqual([]);
  });
});

describe("BUILTIN_BLOCK_TYPES", () => {
  it("includes the new location and gallery built-ins", () => {
    expect(BUILTIN_BLOCK_TYPES).toContain("location");
    expect(BUILTIN_BLOCK_TYPES).toContain("gallery");
  });
});

describe("resolveLocationConfig — places fallback", () => {
  it("falls back to legacy places data when location is unset", () => {
    const cfg = normalizeLandingConfig({
      places: {
        neighborhood: "Flamingo Park",
        walk_score: 94,
        bike_score: 70,
        items: [{ name: "Library", walk_time: "3 min" }],
      },
    });
    const loc = resolveLocationConfig(cfg);
    expect(loc.walk_score).toBe(94);
    expect(loc.bike_score).toBe(70);
    expect(loc.heading).toBe("The Flamingo Park Neighborhood");
    expect(loc.highlights).toHaveLength(1);
    expect(loc.highlights[0].name).toBe("Library");
  });

  it("prefers explicit location data over places", () => {
    const cfg = normalizeLandingConfig({
      places: { neighborhood: "Old", walk_score: 50, bike_score: 50, items: [{ name: "Old place" }] },
      location: {
        heading: "Custom Heading",
        walk_score: 99,
        highlights: [{ name: "New place" }],
        stats: [],
      },
    });
    const loc = resolveLocationConfig(cfg);
    expect(loc.heading).toBe("Custom Heading");
    expect(loc.walk_score).toBe(99);
    // bike_score not set on location → falls back to places
    expect(loc.bike_score).toBe(50);
    expect(loc.highlights[0].name).toBe("New place");
  });
});

describe("hasLocationContent", () => {
  it("is true when geo is present even with empty config", () => {
    const empty = resolveLocationConfig(defaultLandingConfig());
    expect(hasLocationContent(empty, true)).toBe(true);
    expect(hasLocationContent(empty, false)).toBe(false);
  });

  it("is true when any score or highlight exists", () => {
    const loc = resolveLocationConfig(
      normalizeLandingConfig({ places: { walk_score: 80, items: [], neighborhood: "" } })
    );
    expect(hasLocationContent(loc, false)).toBe(true);
  });
});

describe("narrativeSections — numbered editorial flow", () => {
  function cfgWith(types: string[]): LandingConfig {
    const base = defaultLandingConfig();
    base.blocks = types.map((type, i) => ({ id: `b${i}`, type: type as any, enabled: true }));
    return base;
  }

  it("numbers only narrative-capable sections, sequentially, two-digit padded", () => {
    const cfg = cfgWith(["about", "content", "amenities", "location", "gallery", "contact"]);
    const out = narrativeSections(cfg);
    const numbers = out.map((e) => e.number);
    // about/amenities/contact carry no number; content/location/gallery do
    expect(numbers).toEqual(["", "01", "", "02", "03", ""]);
    NARRATIVE_BLOCK_TYPES.forEach((t) => {
      const entry = out.find((e) => e.block.type === t);
      expect(entry?.number).toMatch(/^\d\d$/);
    });
  });

  it("skips disabled blocks", () => {
    const cfg = cfgWith(["content", "location", "gallery"]);
    cfg.blocks[1].enabled = false;
    const out = narrativeSections(cfg);
    expect(out.map((e) => e.block.type)).toEqual(["content", "gallery"]);
    expect(out.map((e) => e.number)).toEqual(["01", "02"]);
  });

  it("lets a content block's own number_label win over the sequential number", () => {
    const cfg = cfgWith(["content", "content"]);
    cfg.blocks[0] = { ...cfg.blocks[0], type: "content", number_label: "07" } as any;
    const out = narrativeSections(cfg);
    expect(out[0].number).toBe("07");
    expect(out[1].number).toBe("02");
  });

  it("alternates the background among content sections only", () => {
    const cfg = cfgWith(["content", "amenities", "content", "content"]);
    const out = narrativeSections(cfg);
    const contentAlts = out.filter((e) => e.block.type === "content").map((e) => e.alt);
    expect(contentAlts).toEqual([false, true, false]);
  });
});

describe("normalizeLandingConfig — location & gallery blocks survive a round-trip", () => {
  it("keeps stored location and gallery blocks (regression: they were being dropped)", () => {
    const cfg = normalizeLandingConfig({
      blocks: [
        { id: "b_about", type: "about", enabled: true },
        { id: "b_location", type: "location", enabled: true },
        { id: "b_gallery", type: "gallery", enabled: false },
      ],
    });
    expect(cfg.blocks.map((b) => b.type)).toEqual(["about", "location", "gallery"]);
    expect(cfg.blocks.find((b) => b.type === "gallery")?.enabled).toBe(false);
  });
});

describe("normalizeLandingConfig — public light/dark mode", () => {
  it("defaults to light, so no existing site changes appearance on deploy", () => {
    expect(defaultLandingConfig().mode).toBe("light");
    expect(normalizeLandingConfig(null).mode).toBe("light");
    // Every org stored before `mode` existed has a blob without the key.
    expect(normalizeLandingConfig({ widgets: [], blocks: [] }).mode).toBe("light");
  });

  it("only the literal string 'dark' turns a site dark", () => {
    expect(normalizeLandingConfig({ mode: "dark" }).mode).toBe("dark");
    for (const junk of ["Dark", "DARK", true, 1, "night", "", null, undefined, {}]) {
      expect(normalizeLandingConfig({ mode: junk }).mode).toBe("light");
    }
  });

  it("survives a round-trip through JSON, which is how it is stored", () => {
    const cfg = normalizeLandingConfig({ mode: "dark" });
    expect(normalizeLandingConfig(JSON.parse(JSON.stringify(cfg))).mode).toBe("dark");
  });
});

describe("normalizeLandingConfig — palette", () => {
  it("defaults to the style's own ramp", () => {
    expect(defaultLandingConfig().palette).toBe("default");
    expect(normalizeLandingConfig(null).palette).toBe("default");
    expect(normalizeLandingConfig({ widgets: [], blocks: [] }).palette).toBe("default");
  });

  it("only the literal string 'gold' opts in", () => {
    expect(normalizeLandingConfig({ palette: "gold" }).palette).toBe("gold");
    for (const junk of ["Gold", "GOLD", "warm", true, 1, null, undefined, {}]) {
      expect(normalizeLandingConfig({ palette: junk }).palette).toBe("default");
    }
  });

  it("is independent of mode — either palette works in either mode", () => {
    const darkGold = normalizeLandingConfig({ mode: "dark", palette: "gold" });
    expect(darkGold.mode).toBe("dark");
    expect(darkGold.palette).toBe("gold");
  });
});

describe("normalizeLandingConfig — hero CTA", () => {
  it("is opt-OUT, so no existing site loses its only way in", () => {
    expect(defaultLandingConfig().hero_cta).toBe(true);
    expect(normalizeLandingConfig(null).hero_cta).toBe(true);
    expect(normalizeLandingConfig({ widgets: [], blocks: [] }).hero_cta).toBe(true);
  });

  it("only an explicit false turns it off", () => {
    expect(normalizeLandingConfig({ hero_cta: false }).hero_cta).toBe(false);
    // Not falsy-checked: an absent or junk value must still show the buttons.
    for (const junk of [0, "", null, undefined, "false"]) {
      expect(normalizeLandingConfig({ hero_cta: junk }).hero_cta).toBe(true);
    }
  });
});

describe("normalizeBlock — the numbered label is not content-only", () => {
  it("keeps number_label and category on a built-in block", () => {
    // The reference site numbers its FAQ "09 / FAQ". These used to sit below an
    // early return, so any label on a non-content block was dropped silently.
    const cfg = normalizeLandingConfig({
      blocks: [{ id: "f", type: "faq", number_label: "09", category: "FAQ" }],
    });
    const faq = cfg.blocks.find((b) => b.type === "faq")!;
    expect(faq.number_label).toBe("09");
    expect(faq.category).toBe("FAQ");
  });

  it("still keeps them on a content block", () => {
    const cfg = normalizeLandingConfig({
      blocks: [{ id: "c", type: "content", number_label: "01", category: "Philosophy" }],
    });
    expect(cfg.blocks[0]!.number_label).toBe("01");
    expect(cfg.blocks[0]!.category).toBe("Philosophy");
  });

  it("defaults them to empty, so an unlabelled section shows no number", () => {
    const cfg = normalizeLandingConfig({ blocks: [{ id: "f", type: "faq" }] });
    expect(cfg.blocks[0]!.number_label).toBe("");
    expect(cfg.blocks[0]!.category).toBe("");
  });
});
