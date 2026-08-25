/**
 * Landing AI wizard — shared, pure model + validator.
 *
 * The landing analogue of `shared/email/blocks.ts`'s AI types: it defines the
 * JSON shape the model must return for "generate my whole site from a sentence",
 * and the pure functions that sanitize that (untrusted) JSON and map it onto the
 * real `LandingConfig` shapes. Both the server route (`/api/landing/ai-generate`,
 * which sanitizes before returning) and the client composable (which applies the
 * result to the canvas) import from here so the contract can't drift.
 *
 * Grounding (pulling the org's true amenities/board/location/positioning) happens
 * server-side; this module only shapes + validates structure. Keep it pure — no
 * auto-imports, no Directus, no network.
 */

import {
  CONTENT_LAYOUTS,
  FEATURE_STYLES,
  type ContentLayout,
  type FeatureStyle,
  type LandingBlock,
  type LandingBlockType,
  type LandingFaqItem,
  type LandingLocationConfig,
} from "../utils/landing";

/** Block types the wizard may position. Built-ins carry no copy of their own. */
export const AI_SECTION_TYPES: LandingBlockType[] = [
  "content",
  "about",
  "amenities",
  "board",
  "contact",
  "listings",
  "faq",
  "location",
  "gallery",
];

export interface AiLandingFeature {
  icon?: string;
  title?: string;
  text: string;
  wide?: boolean;
}

export interface AiLandingStat {
  value: string;
  unit?: string;
  label: string;
  icon?: string;
}

/** One ordered section the model returns → mapped to a LandingBlock. */
export interface AiLandingSection {
  type: string; // one of AI_SECTION_TYPES (validated)
  layout?: string; // content only
  eyebrow?: string;
  title?: string;
  body?: string;
  tagline?: string;
  category?: string;
  number_label?: string;
  features?: AiLandingFeature[];
  feature_style?: string;
  feature_columns?: number;
  stats?: AiLandingStat[];
}

export interface AiLandingLocation {
  heading?: string;
  intro?: string;
  walk_score?: number | null;
  bike_score?: number | null;
  transit_score?: number | null;
  highlights?: { name: string; walk_time?: string; distance?: string }[];
  walk_times?: { minutes: string; label: string }[];
}

/** The full structured payload the wizard returns. */
export interface AiLandingResult {
  hero?: { title?: string; subtitle?: string };
  /** A short "about" narrative — applied to settings.description (SEO + About block). */
  about?: string;
  faq?: LandingFaqItem[];
  location?: AiLandingLocation | null;
  sections: AiLandingSection[];
}

/** The JSON-shape hint embedded in the system prompt (kept beside the types). */
export const AI_LANDING_JSON_SHAPE =
  '{"hero":{"title":string,"subtitle":string},"about":string,' +
  '"sections":[{"type":"content|about|amenities|board|contact|listings|faq|location|gallery",' +
  '"layout":"text-image|image-text|image-grid|stats|gallery","eyebrow":string,"title":string,' +
  '"body":string,"tagline":string,"category":string,' +
  '"features":[{"icon":"lucide:name","title":string,"text":string,"wide":boolean}],' +
  '"feature_style":"list|bullets|cards|tiles","feature_columns":1-4,' +
  '"stats":[{"value":string,"unit":string,"label":string,"icon":"lucide:name"}]}],' +
  '"faq":[{"question":string,"answer":string}],' +
  '"location":{"heading":string,"intro":string,"walk_score":number,"bike_score":number,' +
  '"transit_score":number,"highlights":[{"name":string,"walk_time":string,"distance":string}],' +
  '"walk_times":[{"minutes":string,"label":string}]}}';

// ── Coercion helpers ────────────────────────────────────────────────────────
function str(v: unknown, max = 2000): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

let _seq = 0;
/** Stable-ish unique id for a generated block (pure — no Date/Math.random). */
function genId(): string {
  _seq += 1;
  return `b_ai_${_seq.toString(36)}${((_seq * 2654435761) % 1000000).toString(36)}`;
}

/**
 * Sanitize the model's (untrusted) JSON into a well-typed AiLandingResult:
 * clamp strings, drop unknown section types, coerce enums/numbers. Never throws.
 */
export function sanitizeAiLandingResult(raw: unknown): AiLandingResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;

  const hero = r.hero && typeof r.hero === "object"
    ? { title: str(r.hero.title, 120), subtitle: str(r.hero.subtitle, 200) }
    : undefined;

  const sections: AiLandingSection[] = arr(r.sections)
    .filter((s) => s && AI_SECTION_TYPES.includes(String(s.type) as LandingBlockType))
    .map((s) => ({
      type: String(s.type),
      layout: CONTENT_LAYOUTS.includes(s.layout) ? s.layout : undefined,
      eyebrow: str(s.eyebrow, 80),
      title: str(s.title, 160),
      body: str(s.body, 1500),
      tagline: str(s.tagline, 200),
      category: str(s.category, 60),
      number_label: str(s.number_label, 6),
      feature_style: FEATURE_STYLES.includes(s.feature_style) ? s.feature_style : undefined,
      feature_columns: [1, 2, 3, 4].includes(Number(s.feature_columns))
        ? Number(s.feature_columns)
        : undefined,
      features: arr(s.features)
        .filter((f) => f && (f.text || f.title))
        .slice(0, 12)
        .map((f) => ({
          icon: str(f.icon, 60),
          title: str(f.title, 80),
          text: str(f.text, 240),
          wide: f.wide === true,
        })),
      stats: arr(s.stats)
        .filter((st) => st && (st.value || st.label))
        .slice(0, 8)
        .map((st) => ({
          value: str(st.value, 12),
          unit: str(st.unit, 12),
          label: str(st.label, 60),
          icon: str(st.icon, 60),
        })),
    }));

  const faq: LandingFaqItem[] = arr(r.faq)
    .filter((f) => f && f.question && f.answer)
    .slice(0, 12)
    .map((f) => ({ question: str(f.question, 200), answer: str(f.answer, 1000) }));

  const loc = r.location && typeof r.location === "object" ? r.location : null;
  const location: AiLandingLocation | null = loc
    ? {
        heading: str(loc.heading, 120),
        intro: str(loc.intro, 600),
        walk_score: numOrNull(loc.walk_score),
        bike_score: numOrNull(loc.bike_score),
        transit_score: numOrNull(loc.transit_score),
        highlights: arr(loc.highlights)
          .filter((h) => h && h.name)
          .slice(0, 10)
          .map((h) => ({
            name: str(h.name, 80),
            walk_time: str(h.walk_time, 24),
            distance: str(h.distance, 24),
          })),
        walk_times: arr(loc.walk_times)
          .filter((w) => w && (w.minutes || w.label))
          .slice(0, 6)
          .map((w) => ({ minutes: str(w.minutes, 6), label: str(w.label, 60) })),
      }
    : null;

  return { hero, about: str(r.about, 1200), faq, location, sections };
}

/** Map one sanitized content section to a full content LandingBlock. */
function contentBlock(s: AiLandingSection): LandingBlock {
  return {
    id: genId(),
    type: "content",
    enabled: true,
    layout: (CONTENT_LAYOUTS.includes(s.layout as ContentLayout)
      ? (s.layout as ContentLayout)
      : "text-image") as ContentLayout,
    number_label: s.number_label || "",
    category: s.category || "",
    eyebrow: s.eyebrow || "",
    title: s.title || "",
    body: s.body || "",
    tagline: s.tagline || "",
    images: [],
    stats: (s.stats || []).map((st) => ({
      value: st.value,
      unit: st.unit || undefined,
      label: st.label,
      icon: st.icon || undefined,
    })),
    features: (s.features || []).map((f) => ({
      icon: f.icon || undefined,
      title: f.title || undefined,
      text: f.text,
      wide: f.wide === true,
    })),
    feature_style: (FEATURE_STYLES.includes(s.feature_style as FeatureStyle)
      ? (s.feature_style as FeatureStyle)
      : "list") as FeatureStyle,
    feature_columns: s.feature_columns || 2,
    full_width: false,
    show_in_menu: true,
    menu_icon: "",
  };
}

/** The LandingConfig pieces the wizard fills (everything that IS config). */
export interface AiConfigPatch {
  blocks: LandingBlock[];
  location: LandingLocationConfig | null;
  faq: LandingFaqItem[];
}

/**
 * Map a sanitized result onto real LandingConfig shapes: an ordered `blocks[]`
 * (content sections fully built; built-ins de-duplicated as singletons), the
 * `location` sub-config (when a Location section was returned), and `faq`.
 * Pure — the caller decides how to apply it (replace vs merge).
 */
export function aiResultToConfigPatch(result: AiLandingResult): AiConfigPatch {
  const blocks: LandingBlock[] = [];
  const seenBuiltin = new Set<LandingBlockType>();
  let sawLocation = false;

  for (const s of result.sections) {
    const type = s.type as LandingBlockType;
    if (type === "content") {
      blocks.push(contentBlock(s));
      continue;
    }
    if (seenBuiltin.has(type)) continue; // built-ins are singletons
    seenBuiltin.add(type);
    if (type === "location") sawLocation = true;
    blocks.push({ id: `b_${type}`, type, enabled: true });
  }

  // A Location payload with no positioned section still deserves a block.
  if (result.location && !sawLocation) {
    blocks.push({ id: "b_location", type: "location", enabled: true });
  }

  const location: LandingLocationConfig | null = result.location
    ? {
        heading: result.location.heading || "",
        intro: result.location.intro || "",
        walk_score: result.location.walk_score ?? null,
        bike_score: result.location.bike_score ?? null,
        transit_score: result.location.transit_score ?? null,
        highlights: result.location.highlights || [],
        stats: [],
        walk_times: result.location.walk_times || [],
        lifestyle: null,
      }
    : null;

  return { blocks, location, faq: result.faq || [] };
}

/** Convenience for the composable: sections (+ optional location) → blocks. */
export function aiSectionsToBlocks(
  sections: AiLandingSection[]
): { blocks: LandingBlock[]; location: LandingLocationConfig | null } {
  const { blocks, location } = aiResultToConfigPatch({ sections });
  return { blocks, location };
}
