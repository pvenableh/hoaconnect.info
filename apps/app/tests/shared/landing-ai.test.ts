import { describe, it, expect } from "vitest";
import {
  sanitizeAiLandingResult,
  aiResultToConfigPatch,
  aiSectionsToBlocks,
  AI_SECTION_TYPES,
} from "#core/shared/landing/ai";

describe("sanitizeAiLandingResult", () => {
  it("returns an empty-but-valid shape for junk input", () => {
    const r = sanitizeAiLandingResult(null);
    expect(r.sections).toEqual([]);
    expect(r.faq).toEqual([]);
    expect(r.location).toBeNull();
  });

  it("drops unknown section types and coerces enums", () => {
    const r = sanitizeAiLandingResult({
      hero: { title: "Casa Verde", subtitle: "  Boutique living  " },
      about: "  A calm place.  ",
      sections: [
        { type: "content", layout: "bogus-layout", title: "Intro", body: "Hi", feature_style: "nope", feature_columns: 9 },
        { type: "wat" }, // dropped — unknown type
        { type: "amenities" },
      ],
    });
    expect(r.hero?.subtitle).toBe("Boutique living");
    expect(r.about).toBe("A calm place.");
    expect(r.sections.map((s) => s.type)).toEqual(["content", "amenities"]);
    // invalid enums → undefined (mapper falls back to defaults later)
    expect(r.sections[0]!.layout).toBeUndefined();
    expect(r.sections[0]!.feature_style).toBeUndefined();
    expect(r.sections[0]!.feature_columns).toBeUndefined();
  });

  it("keeps only known section types", () => {
    const r = sanitizeAiLandingResult({
      sections: AI_SECTION_TYPES.map((t) => ({ type: t })).concat([{ type: "fake" } as any]),
    });
    expect(r.sections.length).toBe(AI_SECTION_TYPES.length);
  });

  it("coerces location scores and drops nameless highlights", () => {
    const r = sanitizeAiLandingResult({
      sections: [{ type: "location" }],
      location: {
        heading: "The Park",
        walk_score: "94",
        bike_score: 80,
        transit_score: "",
        highlights: [{ name: "Beach", walk_time: "6 min" }, { name: "" }],
      },
    });
    expect(r.location?.walk_score).toBe(94);
    expect(r.location?.bike_score).toBe(80);
    expect(r.location?.transit_score).toBeNull();
    expect(r.location?.highlights).toHaveLength(1);
  });
});

describe("aiResultToConfigPatch", () => {
  it("maps a content section to a full content block", () => {
    const { blocks } = aiResultToConfigPatch(
      sanitizeAiLandingResult({
        sections: [
          {
            type: "content",
            layout: "stats",
            title: "By the numbers",
            eyebrow: "Facts",
            features: [{ text: "Pet friendly", icon: "lucide:dog" }],
            stats: [{ value: "28", label: "Homes" }],
          },
        ],
      })
    );
    expect(blocks).toHaveLength(1);
    const b = blocks[0]!;
    expect(b.type).toBe("content");
    expect(b.layout).toBe("stats");
    expect(b.title).toBe("By the numbers");
    expect(b.features?.[0]?.text).toBe("Pet friendly");
    expect(b.stats?.[0]?.value).toBe("28");
    expect(b.enabled).toBe(true);
    expect(b.id).toBeTruthy();
  });

  it("de-duplicates built-in sections into singletons with stable ids", () => {
    const { blocks } = aiResultToConfigPatch(
      sanitizeAiLandingResult({
        sections: [{ type: "amenities" }, { type: "amenities" }, { type: "faq" }],
      })
    );
    expect(blocks.map((b) => b.id)).toEqual(["b_amenities", "b_faq"]);
  });

  it("emits a location block + config from location data even without a positioned section", () => {
    const { blocks, location } = aiResultToConfigPatch(
      sanitizeAiLandingResult({
        sections: [{ type: "content", title: "Intro" }],
        location: { heading: "On the Park", walk_score: 90 },
      })
    );
    expect(blocks.some((b) => b.type === "location")).toBe(true);
    expect(location?.heading).toBe("On the Park");
    expect(location?.walk_score).toBe(90);
  });

  it("passes FAQ through to the patch", () => {
    const { faq } = aiResultToConfigPatch(
      sanitizeAiLandingResult({
        sections: [{ type: "faq" }],
        faq: [{ question: "Pets?", answer: "Yes." }],
      })
    );
    expect(faq).toEqual([{ question: "Pets?", answer: "Yes." }]);
  });
});

describe("aiSectionsToBlocks", () => {
  it("returns blocks for the convenience path", () => {
    const { blocks } = aiSectionsToBlocks(
      sanitizeAiLandingResult({ sections: [{ type: "content", title: "Hi" }] }).sections
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("content");
  });
});
