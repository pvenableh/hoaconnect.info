// useLandingBuilder — client canvas state for the public-site (landing) builder.
//
// The landing analogue of useEmailBuilder: it operates on a single `LandingConfig`
// (the source of truth stored on settings.landing) and exposes the canvas
// mutations the three-pane builder needs — add / remove / move / duplicate /
// reorder / toggle sections, plus the single-instance sub-config materializers
// (location/gallery) and an AI-populate path. The host page (LandingBuilderPage)
// owns loading + persistence; this composable only shapes `landing.value`.
//
// Mirrors the email builder's "reassign the array so computeds re-run" +
// singleton-builtin conventions. Pure client state — no Directus, no $fetch.

import { nanoid } from "nanoid";
import {
  BUILTIN_BLOCK_TYPES,
  type ContentLayout,
  type FeatureStyle,
  type LandingBlock,
  type LandingBlockType,
  type LandingConfig,
  type LandingGalleryConfig,
  type LandingLocationConfig,
} from "#core/shared/utils/landing";
import { aiResultToConfigPatch, type AiLandingResult } from "#core/shared/landing/ai";

/** A fresh, fully-defaulted content block (the flexible editorial section). */
export function makeContentBlock(layout: ContentLayout = "text-image"): LandingBlock {
  return {
    id: `b_${nanoid(8)}`,
    type: "content",
    enabled: true,
    layout,
    number_label: "",
    category: "",
    eyebrow: "",
    title: "",
    body: "",
    tagline: "",
    images: [],
    stats: [],
    features: [],
    feature_style: "list" as FeatureStyle,
    feature_columns: 2,
    full_width: false,
    show_in_menu: true,
    menu_icon: "",
  };
}

/** The materialized default for the single-instance Location section. */
export function makeLocationConfig(): LandingLocationConfig {
  return {
    heading: "",
    intro: "",
    walk_score: null,
    bike_score: null,
    transit_score: null,
    highlights: [],
    stats: [],
    walk_times: [],
    lifestyle: null,
  };
}

/** The materialized default for the single-instance Gallery section. */
export function makeGalleryConfig(): LandingGalleryConfig {
  return { source: "manual", folder: null, images: [], caption: "" };
}

export function useLandingBuilder(landing: Ref<LandingConfig>) {
  const isEmpty = computed(() => (landing.value.blocks || []).length === 0);

  /** Built-in section types the org hasn't added yet (offered in the palette). */
  const missingBuiltins = computed(() =>
    BUILTIN_BLOCK_TYPES.filter((t) => !landing.value.blocks.some((b) => b.type === t))
  );

  const has = (type: LandingBlockType) => landing.value.blocks.some((b) => b.type === type);
  const indexOf = (id: string) => landing.value.blocks.findIndex((b) => b.id === id);

  // ── Single-instance sub-configs (location/gallery live on the config root) ──
  function ensureLocation(): LandingLocationConfig {
    if (!landing.value.location) landing.value.location = makeLocationConfig();
    const loc = landing.value.location;
    if (!Array.isArray(loc.walk_times)) loc.walk_times = [];
    if (loc.lifestyle === undefined) loc.lifestyle = null;
    return loc;
  }
  function ensureGallery(): LandingGalleryConfig {
    if (!landing.value.gallery) landing.value.gallery = makeGalleryConfig();
    return landing.value.gallery;
  }

  // ── Canvas mutations ────────────────────────────────────────────────────
  /** Add a flexible content section; returns its id (so the host can expand it). */
  function addContentBlock(layout: ContentLayout = "text-image"): string {
    const block = makeContentBlock(layout);
    landing.value.blocks = [...landing.value.blocks, block];
    return block.id;
  }

  /** Add a built-in section (singleton — one instance per type). */
  function addBuiltinBlock(type: LandingBlockType): string {
    if (has(type)) return `b_${type}`;
    if (type === "location") ensureLocation();
    if (type === "gallery") ensureGallery();
    const block: LandingBlock = { id: `b_${type}`, type, enabled: true };
    landing.value.blocks = [...landing.value.blocks, block];
    return block.id;
  }

  function removeBlock(id: string) {
    landing.value.blocks = landing.value.blocks.filter((b) => b.id !== id);
  }

  /** Duplicate a content block (built-ins are singletons and aren't cloned). */
  function duplicateBlock(id: string) {
    const i = indexOf(id);
    if (i === -1) return;
    const src = landing.value.blocks[i]!;
    if (src.type !== "content") return;
    const copy: LandingBlock = {
      ...structuredClone(toRaw(src)),
      id: `b_${nanoid(8)}`,
    };
    const next = [...landing.value.blocks];
    next.splice(i + 1, 0, copy);
    landing.value.blocks = next;
  }

  function moveBlock(id: string, direction: "up" | "down") {
    const i = indexOf(id);
    if (i === -1) return;
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= landing.value.blocks.length) return;
    const next = [...landing.value.blocks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    landing.value.blocks = next;
  }

  /** Replace the block order wholesale (from a drag reorder). */
  function setOrder(blocks: LandingBlock[]) {
    landing.value.blocks = [...blocks];
  }

  function toggleBlock(id: string, enabled?: boolean) {
    const b = landing.value.blocks.find((x) => x.id === id);
    if (!b) return;
    b.enabled = enabled ?? !b.enabled;
    landing.value.blocks = [...landing.value.blocks];
  }

  // ── AI populate ───────────────────────────────────────────────────────────
  /**
   * Apply an AI-generated result. The shared validator maps it onto real
   * LandingConfig shapes (`aiResultToConfigPatch`): ordered blocks, the location
   * sub-config, and the FAQ list. Replaces the canvas + those config sections —
   * the host confirms before calling this on a non-empty canvas, and applies the
   * non-config pieces (hero copy, About description) itself.
   */
  function populateFromAI(result: AiLandingResult) {
    const { blocks, location, faq } = aiResultToConfigPatch(result);
    if (!blocks.length) return;
    landing.value.blocks = blocks;
    if (location) landing.value.location = location;
    if (faq.length) landing.value.faq = faq;
  }

  return {
    isEmpty,
    missingBuiltins,
    has,
    ensureLocation,
    ensureGallery,
    addContentBlock,
    addBuiltinBlock,
    removeBlock,
    duplicateBlock,
    moveBlock,
    setOrder,
    toggleBlock,
    populateFromAI,
  };
}

export type LandingBuilder = ReturnType<typeof useLandingBuilder>;

/** An amenity row edited in the builder (hoa_amenities upsert on save). */
export interface BuilderAmenity {
  id?: string;
  title: string;
  icon: string;
  description: string;
}

/** A board member option for the inquiry recipient picker. */
export interface BuilderBoardMember {
  id: string;
  name: string;
  email: string;
}

/**
 * The page-level content that lives OUTSIDE `LandingConfig` but still shapes the
 * landing (org fields, hero, theme, amenities). Held reactive on the page and
 * shared with editors via the builder context.
 */
export interface LandingBuilderSite {
  theme: "classic" | "modern" | "luxury";
  type: "" | "residential" | "commercial";
  description: string;
  phone: string;
  email: string;
  show_board: boolean;
  hero: {
    title: string;
    subtitle: string;
    bgId: string | null;
    fgId: string | null;
  };
  amenities: BuilderAmenity[];
  removedAmenityIds: string[];
  boardMembers: BuilderBoardMember[];
  hasManagementVendor: boolean;
}

/** The shared builder context provided by the page and injected by editors. */
export interface LandingBuilderContext {
  org: Ref<any>;
  landing: Ref<LandingConfig>;
  site: LandingBuilderSite;
  builder: LandingBuilder;
  /** Upload a File to the org folder; resolves to the new Directus file id. */
  uploadImage: (file: File, title?: string) => Promise<string | null>;
  /** Asset URL for a Directus file id (optional transform key, e.g. "small"). */
  fileUrl: (id: string | null | undefined, key?: string) => string;
}

export const LandingBuilderKey: InjectionKey<LandingBuilderContext> =
  Symbol("landing-builder");

export function useLandingBuilderContext(): LandingBuilderContext {
  const ctx = inject(LandingBuilderKey);
  if (!ctx) throw new Error("useLandingBuilderContext must be used within the landing builder");
  return ctx;
}
