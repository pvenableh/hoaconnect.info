/**
 * Public-landing configuration (shared, pure).
 *
 * The per-org landing config lives on `block_settings.landing` (read as
 * `org.settings.landing`). This module is the single source of truth for its
 * shape, the widget registry, defaults, and a normalizer that tolerates partial
 * / legacy / null blobs. Lives in `shared/utils` so it is auto-imported in BOTH
 * the Nuxt app (landing + settings editor) and the Nitro server (weather +
 * public-inquiry routes). Keep it pure — no auto-imports, no Directus calls.
 */

export type LandingWidgetKey =
  | "greeting"
  | "weather"
  | "location"
  | "building"
  | "board"
  | "amenities";

export type InquiryCategory = "sale" | "rental" | "general";
export type ListingType = "sale" | "rental";
export type InquiryRecipientType = "email" | "user";

export interface LandingWidgetPref {
  key: LandingWidgetKey;
  enabled: boolean;
}

export interface LandingPlaceItem {
  name: string;
  walk_time?: string;
  distance?: string;
}

export interface LandingPlaces {
  neighborhood?: string;
  walk_score?: number | null;
  bike_score?: number | null;
  items: LandingPlaceItem[];
}

export interface LandingListing {
  type: ListingType;
  title: string;
  url: string;
  price?: string;
  image?: string | null; // Directus file id
}

export interface LandingFaqItem {
  question: string;
  answer: string;
}

export interface LandingInquiryConfig {
  enabled: boolean;
  recipient_type: InquiryRecipientType;
  email?: string | null;
  user?: string | null; // Directus user id
}

export interface LandingGeo {
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Location section (the editorial "Neighborhood / Location" block).
//
// Distinct from the hero `places` widget config (which still feeds the modern
// glass Location widget): this drives the full-width editorial Location SECTION
// — a grayscale map, walk/bike/transit stats, and curated nearby highlights.
// When unset, `resolveLocationConfig` falls back to the legacy `places` data so
// existing orgs light up the new section without re-entering anything.
// ---------------------------------------------------------------------------

export interface LandingLocationStat {
  value: string;
  unit?: string;
  label: string;
}

/** A walk-time number tile in the location band ("6 min — to the Ocean"). */
export interface LandingWalkTime {
  minutes: string;
  label: string;
}

/** One lifestyle card in the "Active Living, Steps Away" gallery. */
export interface LandingLifestyleItem {
  icon?: string;
  title: string;
  desc?: string;
  image?: string | null; // Directus file id
}

/** The lifestyle gallery sub-section of the Location block. */
export interface LandingLifestyle {
  eyebrow?: string;
  heading?: string;
  items: LandingLifestyleItem[];
}

export interface LandingLocationConfig {
  heading?: string;
  intro?: string;
  walk_score?: number | null;
  bike_score?: number | null;
  transit_score?: number | null;
  /** Curated nearby places (name + walk time + distance). */
  highlights: LandingPlaceItem[];
  /** Extra editorial stats shown alongside the scores (e.g. "12 — minutes to the beach"). */
  stats: LandingLocationStat[];
  /** Walk-time number band ("6 min — to the Ocean"). */
  walk_times: LandingWalkTime[];
  /** "Active Living, Steps Away" lifestyle gallery. */
  lifestyle: LandingLifestyle | null;
}

// ---------------------------------------------------------------------------
// Gallery section — a full-bleed editorial image gallery (swiper). Images come
// either from a hand-picked list of Directus file ids ("manual") or live from
// one of the org's storage folders ("folder", resolved by /api/landing/gallery).
// ---------------------------------------------------------------------------

/**
 * Light or dark for the PUBLIC landing. A community property, not a visitor's
 * preference — 1033lenox.com, the reference this landing imitates, keeps its
 * dark-mode toggle on an interior page and never offers one on the landing
 * itself, and neither do we.
 *
 * theme.css has always carried all six `theme-{style}-{mode}` blocks and the
 * landing CSS has a full set of `theme-*-dark` rules, but nothing could reach
 * them: `forceThemeStyle` defaults to light and every caller passed a style
 * only. The one path that ever produced a dark landing was accidental —
 * `initTheme()` reading the signed-in user's WORKSPACE appearance — and closing
 * that leak (612e338) left the dark half of the stylesheet unreachable. This is
 * the switch it never had.
 */
export type LandingMode = "light" | "dark";
export const LANDING_MODES: LandingMode[] = ["light", "dark"];

/**
 * An optional palette on top of the chosen style — the ink and accent ramp,
 * not the layout.
 *
 * `classic` began life as 1033lenox.com's theme and was warm: gold `#c9a96e`,
 * `#454545` text, cream-tinted borders and shadows. The shared copy has since
 * been re-tinted cool — cyan `#00bfff`, near-black text, neutral borders — so an
 * org that wants the original editorial warmth can no longer get it from the
 * style alone. `gold` restores exactly that ramp, in both light and dark, and
 * leaves every other classic org on what it has today.
 *
 * Deliberately a named preset rather than a free hex: the difference is ~20
 * coordinated tokens (accent, ink ramp, borders, dividers, links, buttons,
 * warm-tinted shadows), and picking one colour would not derive the other
 * nineteen. A custom entry can join this union later without changing shape.
 */
export type LandingPalette = "default" | "gold";
export const LANDING_PALETTES: LandingPalette[] = ["default", "gold"];

export type LandingGallerySource = "manual" | "folder";

export interface LandingGalleryConfig {
  source: LandingGallerySource;
  /** Directus folder id to pull from when source === "folder" (defaults to the org root folder). */
  folder?: string | null;
  /** Hand-picked Directus file ids when source === "manual". */
  images: string[];
  /** Optional editorial eyebrow/caption shown above the gallery. */
  caption?: string;
}

// ---------------------------------------------------------------------------
// Unified content blocks — the admin-orderable list of landing sections.
//
// Each block is either a BUILT-IN (positions/toggles a feature whose data lives
// elsewhere: amenities/board/contact read org data, listings/faq read the
// cfg.listings/cfg.faq arrays, about reads settings.description) or a flexible
// "content" block that carries its own editorial copy + imagery. One list, fully
// reorderable, mirroring the bespoke 1033lenox.com index page.
// ---------------------------------------------------------------------------

export type LandingBlockType =
  | "about"
  | "content"
  | "amenities"
  | "listings"
  | "faq"
  | "board"
  | "contact"
  | "location"
  | "gallery";

/** Built-in block types carry no data of their own (data lives elsewhere). */
export const BUILTIN_BLOCK_TYPES: LandingBlockType[] = [
  "about",
  "amenities",
  "listings",
  "faq",
  "board",
  "contact",
  "location",
  "gallery",
];

/**
 * Section types that participate in the classic/luxury numbered editorial
 * narrative ("01 — The Residence"). The remaining built-ins (about/amenities/
 * board/contact/listings) already carry their own editorial chrome, so they
 * interleave without a number. See `narrativeSections`.
 */
export const NARRATIVE_BLOCK_TYPES: LandingBlockType[] = ["content", "location", "gallery"];

export type ContentLayout =
  | "text-image"
  | "image-text"
  | "image-grid"
  | "stats"
  | "gallery";

export const CONTENT_LAYOUTS: ContentLayout[] = [
  "text-image",
  "image-text",
  "image-grid",
  "stats",
  "gallery",
];

export interface LandingImage {
  file: string | null; // Directus file id
  caption_title?: string;
  caption_body?: string;
  fit?: "cover" | "contain";
}

export interface LandingStat {
  value: string;
  unit?: string;
  label: string;
  /** Optional lucide icon shown above the value (icon stat tiles). */
  icon?: string;
}

/**
 * A feature item inside a content section — an icon-able point that breaks into
 * columns (mirrors 1033lenox's design/security/amenities/community items). The
 * `feature_style` on the block decides how it renders (list/bullets/cards/tiles).
 */
export interface LandingFeature {
  /** Lucide icon name (e.g. "lucide:sparkles"). Empty = no icon. */
  icon?: string;
  /** Optional bold lead (used by the card + tile styles). */
  title?: string;
  /** The feature copy. */
  text: string;
  /** Span all columns (an emphasis row). */
  wide?: boolean;
}

export type FeatureStyle = "list" | "bullets" | "cards" | "tiles";
export const FEATURE_STYLES: FeatureStyle[] = ["list", "bullets", "cards", "tiles"];

export interface LandingBlock {
  id: string; // stable key for reorder
  type: LandingBlockType;
  enabled: boolean;
  // content-only fields:
  layout?: ContentLayout;
  number_label?: string; // "01"
  category?: string; // "Philosophy"
  eyebrow?: string;
  title?: string;
  body?: string;
  tagline?: string;
  images?: LandingImage[];
  stats?: LandingStat[];
  /** Icon-able feature items that break into columns (1033-style sections). */
  features?: LandingFeature[];
  /** How `features` render. */
  feature_style?: FeatureStyle;
  /** Column count for the feature grid (1–4). */
  feature_columns?: number;
  /** Render edge-to-edge (drop the numbered side-label column) like 1033's intro. */
  full_width?: boolean;
  /** Surface this content section as a link in the public nav menu (default true). */
  show_in_menu?: boolean;
  /** Lucide icon for the menu link (e.g. "lucide:sparkles"). Empty = no icon. */
  menu_icon?: string;
}

export interface LandingConfig {
  /** Light or dark for the public site. Defaults to light. See LandingMode. */
  mode: LandingMode;
  /** Ink + accent ramp on top of the style. Defaults to the style's own. */
  palette: LandingPalette;
  widgets: LandingWidgetPref[];
  places: LandingPlaces;
  listings: LandingListing[];
  /** Frequently-asked questions, rendered as an editorial accordion section. */
  faq: LandingFaqItem[];
  /** The ordered, admin-controlled list of landing sections. */
  blocks: LandingBlock[];
  inquiry: LandingInquiryConfig;
  geo?: LandingGeo | null;
  /** Editorial Location section config (map + scores + highlights). */
  location?: LandingLocationConfig | null;
  /** Editorial Gallery section config (full-bleed swiper). */
  gallery?: LandingGalleryConfig | null;
  /** Opt-in: surface recent sent announcements on the public landing. Off by
   *  default so internal resident comms are never exposed without intent. */
  show_announcements?: boolean;
  /** Opt-in: feature the org's management company (the primary active
   *  `management` vendor) on the landing — a callout band + a footer line. */
  feature_pm?: boolean;
  /** Opt-in: use the property manager's phone/email in the "Get in Touch"
   *  section instead of the org's own. Requires feature_pm + a management vendor. */
  pm_contact?: boolean;
}

/** Registry of every widget the landing knows how to render, in default order. */
export interface LandingWidgetDef {
  key: LandingWidgetKey;
  label: string;
  icon: string; // lucide icon name
  description: string;
  /** true when the widget needs no org data (always renderable). */
  alwaysAvailable?: boolean;
}

export const LANDING_WIDGET_REGISTRY: LandingWidgetDef[] = [
  {
    key: "greeting",
    label: "Greeting",
    icon: "lucide:sun",
    description: "A time-of-day welcome (and the visitor's name when signed in).",
    alwaysAvailable: true,
  },
  {
    key: "weather",
    label: "Weather",
    icon: "lucide:cloud-sun",
    description: "Live local conditions for the community's address.",
  },
  {
    key: "location",
    label: "Neighborhood",
    icon: "lucide:map-pin",
    description: "Walk score and nearby places you curate.",
  },
  {
    key: "building",
    label: "Community",
    icon: "lucide:building-2",
    description: "Household / member count for the community.",
  },
  {
    key: "board",
    label: "Board",
    icon: "lucide:users",
    description: "Number of board members serving the community.",
  },
  {
    key: "amenities",
    label: "Amenities",
    icon: "lucide:sparkles",
    description: "How many amenities the community offers.",
  },
];

export const LANDING_WIDGET_KEYS: LandingWidgetKey[] = LANDING_WIDGET_REGISTRY.map(
  (w) => w.key
);

/**
 * Default widget prefs — all on. Each widget self-hides when it has no data
 * (weather without an API key, location without curated places, etc.), and the
 * row scrolls horizontally on overflow, so enabling everything gives the richest
 * out-of-the-box landing while letting admins trim what they don't want.
 */
export function defaultLandingWidgets(): LandingWidgetPref[] {
  return LANDING_WIDGET_REGISTRY.map((w) => ({ key: w.key, enabled: true }));
}

/**
 * Default block order — reproduces the landing's historical fixed sequence so
 * existing orgs (whose `blocks` is absent until first save) render unchanged.
 */
export function defaultLandingBlocks(): LandingBlock[] {
  return (["about", "amenities", "listings", "faq", "board", "contact"] as LandingBlockType[]).map(
    (type) => ({ id: `b_${type}`, type, enabled: true })
  );
}

/** Stable-ish id for a freshly-added block (no Date/Math.random — keep it pure). */
let _blockSeq = 0;
export function newBlockId(): string {
  _blockSeq += 1;
  return `b_${_blockSeq}_${_blockSeq * 2654435761 % 100000}`;
}

export function defaultLandingConfig(): LandingConfig {
  return {
    mode: "light",
    palette: "default",
    widgets: defaultLandingWidgets(),
    places: { neighborhood: "", walk_score: null, bike_score: null, items: [] },
    listings: [],
    faq: [],
    blocks: defaultLandingBlocks(),
    inquiry: { enabled: true, recipient_type: "email", email: null, user: null },
    geo: null,
    location: null,
    gallery: null,
    show_announcements: false,
    feature_pm: false,
    pm_contact: false,
  };
}

/**
 * Coerce any stored blob (null / partial / legacy) into a complete LandingConfig.
 * Always returns every registry widget exactly once, preserving the stored
 * order/enabled flags and appending any newly-added widgets (disabled) at the end.
 */
export function normalizeLandingConfig(raw: unknown): LandingConfig {
  const base = defaultLandingConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<LandingConfig> & Record<string, any>;

  // Anything that isn't the literal string "dark" is light — an absent key (every
  // org stored before this existed), a stale value, a typo. Light is what those
  // sites render today and none of them should change appearance on deploy.
  const mode: LandingMode = r.mode === "dark" ? "dark" : "light";
  // Same rule as `mode`: anything unrecognised falls back to the style's own
  // ramp, so no stored site shifts colour because of a typo or a stale value.
  const palette: LandingPalette = r.palette === "gold" ? "gold" : "default";

  // Widgets: keep stored prefs for known keys (in stored order), then append
  // any registry widgets not yet present (default-off, except always-on ones).
  const storedPrefs = Array.isArray(r.widgets) ? r.widgets : [];
  const seen = new Set<string>();
  const widgets: LandingWidgetPref[] = [];
  for (const p of storedPrefs) {
    if (!p || !LANDING_WIDGET_KEYS.includes(p.key) || seen.has(p.key)) continue;
    seen.add(p.key);
    widgets.push({ key: p.key, enabled: !!p.enabled });
  }
  for (const def of LANDING_WIDGET_REGISTRY) {
    if (seen.has(def.key)) continue;
    const fallback = base.widgets.find((w) => w.key === def.key);
    widgets.push({ key: def.key, enabled: fallback?.enabled ?? false });
  }

  const places: LandingPlaces = {
    neighborhood: r.places?.neighborhood ?? "",
    walk_score: numOrNull(r.places?.walk_score),
    bike_score: numOrNull(r.places?.bike_score),
    items: Array.isArray(r.places?.items)
      ? r.places!.items
          .filter((i: any) => i && i.name)
          .map((i: any) => ({
            name: String(i.name),
            walk_time: i.walk_time ? String(i.walk_time) : undefined,
            distance: i.distance ? String(i.distance) : undefined,
          }))
      : [],
  };

  const listings: LandingListing[] = Array.isArray(r.listings)
    ? r.listings
        .filter((l: any) => l && l.url && l.title)
        .map((l: any) => ({
          type: l.type === "rental" ? "rental" : "sale",
          title: String(l.title),
          url: String(l.url),
          price: l.price ? String(l.price) : undefined,
          image: l.image || null,
        }))
    : [];

  const faq: LandingFaqItem[] = Array.isArray(r.faq)
    ? r.faq
        .filter((f: any) => f && f.question && f.answer)
        .map((f: any) => ({ question: String(f.question), answer: String(f.answer) }))
    : [];

  // Blocks: coerce each stored block; fall back to the historical default order
  // when none are stored so existing orgs render exactly as before.
  const blocks: LandingBlock[] = Array.isArray(r.blocks) && r.blocks.length
    ? r.blocks
        .filter((b: any) => b && ALL_BLOCK_TYPES.includes(b.type))
        .map((b: any, i: number) => normalizeBlock(b, i))
    : defaultLandingBlocks();

  const inquiry: LandingInquiryConfig = {
    enabled: r.inquiry?.enabled !== false,
    recipient_type: r.inquiry?.recipient_type === "user" ? "user" : "email",
    email: r.inquiry?.email || null,
    user: r.inquiry?.user || null,
  };

  const geo: LandingGeo | null =
    r.geo && isFiniteNum(r.geo.lat) && isFiniteNum(r.geo.lon)
      ? { lat: Number(r.geo.lat), lon: Number(r.geo.lon) }
      : null;

  const location = normalizeLocation(r.location);
  const gallery = normalizeGallery(r.gallery);

  return {
    mode,
    palette,
    widgets,
    places,
    listings,
    faq,
    blocks,
    inquiry,
    geo,
    location,
    gallery,
    show_announcements: r.show_announcements === true,
    feature_pm: r.feature_pm === true,
    pm_contact: r.pm_contact === true,
  };
}

const ALL_BLOCK_TYPES: LandingBlockType[] = [
  "about",
  "content",
  "amenities",
  "listings",
  "faq",
  "board",
  "contact",
  "location",
  "gallery",
];

/** Coerce one stored block into a complete LandingBlock. */
function normalizeBlock(b: any, index: number): LandingBlock {
  const type: LandingBlockType = ALL_BLOCK_TYPES.includes(b.type) ? b.type : "content";
  const block: LandingBlock = {
    id: b.id ? String(b.id) : `b_${type}_${index}`,
    type,
    enabled: b.enabled !== false,
  };
  if (type !== "content") return block;

  block.layout = CONTENT_LAYOUTS.includes(b.layout) ? b.layout : "text-image";
  block.number_label = b.number_label ? String(b.number_label) : "";
  block.category = b.category ? String(b.category) : "";
  block.show_in_menu = b.show_in_menu !== false; // default: surfaced in the menu
  block.menu_icon = b.menu_icon ? String(b.menu_icon) : "";
  block.eyebrow = b.eyebrow ? String(b.eyebrow) : "";
  block.title = b.title ? String(b.title) : "";
  block.body = b.body ? String(b.body) : "";
  block.tagline = b.tagline ? String(b.tagline) : "";
  block.images = Array.isArray(b.images)
    ? b.images
        .filter((im: any) => im && (im.file || im.caption_title || im.caption_body))
        .map((im: any) => ({
          file: im.file || null,
          caption_title: im.caption_title ? String(im.caption_title) : undefined,
          caption_body: im.caption_body ? String(im.caption_body) : undefined,
          fit: im.fit === "contain" ? "contain" : "cover",
        }))
    : [];
  block.stats = Array.isArray(b.stats)
    ? b.stats
        .filter((s: any) => s && (s.value || s.label))
        .map((s: any) => ({
          value: String(s.value ?? ""),
          unit: s.unit ? String(s.unit) : undefined,
          label: String(s.label ?? ""),
          icon: s.icon ? String(s.icon) : undefined,
        }))
    : [];
  block.features = Array.isArray(b.features)
    ? b.features
        .filter((f: any) => f && (f.text || f.title))
        .map((f: any) => ({
          icon: f.icon ? String(f.icon) : undefined,
          title: f.title ? String(f.title) : undefined,
          text: String(f.text ?? ""),
          wide: f.wide === true,
        }))
    : [];
  block.feature_style = FEATURE_STYLES.includes(b.feature_style) ? b.feature_style : "list";
  block.feature_columns = [1, 2, 3, 4].includes(Number(b.feature_columns))
    ? Number(b.feature_columns)
    : 2;
  block.full_width = b.full_width === true;
  return block;
}

/** Coerce a stored Location blob into a complete config (or null when absent). */
function normalizeLocation(raw: any): LandingLocationConfig | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    heading: raw.heading ? String(raw.heading) : undefined,
    intro: raw.intro ? String(raw.intro) : undefined,
    walk_score: numOrNull(raw.walk_score),
    bike_score: numOrNull(raw.bike_score),
    transit_score: numOrNull(raw.transit_score),
    highlights: Array.isArray(raw.highlights)
      ? raw.highlights
          .filter((i: any) => i && i.name)
          .map((i: any) => ({
            name: String(i.name),
            walk_time: i.walk_time ? String(i.walk_time) : undefined,
            distance: i.distance ? String(i.distance) : undefined,
          }))
      : [],
    stats: Array.isArray(raw.stats)
      ? raw.stats
          .filter((s: any) => s && (s.value || s.label))
          .map((s: any) => ({
            value: String(s.value ?? ""),
            unit: s.unit ? String(s.unit) : undefined,
            label: String(s.label ?? ""),
          }))
      : [],
    walk_times: Array.isArray(raw.walk_times)
      ? raw.walk_times
          .filter((w: any) => w && (w.minutes || w.label))
          .map((w: any) => ({ minutes: String(w.minutes ?? ""), label: String(w.label ?? "") }))
      : [],
    lifestyle: normalizeLifestyle(raw.lifestyle),
  };
}

/** Coerce the "Active Living, Steps Away" lifestyle gallery (or null). */
function normalizeLifestyle(raw: any): LandingLifestyle | null {
  if (!raw || typeof raw !== "object") return null;
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((i: any) => i && (i.title || i.image))
        .map((i: any) => ({
          icon: i.icon ? String(i.icon) : undefined,
          title: String(i.title ?? ""),
          desc: i.desc ? String(i.desc) : undefined,
          image: i.image ? String(i.image) : null,
        }))
    : [];
  return {
    eyebrow: raw.eyebrow ? String(raw.eyebrow) : undefined,
    heading: raw.heading ? String(raw.heading) : undefined,
    items,
  };
}

/** Coerce a stored Gallery blob into a complete config (or null when absent). */
function normalizeGallery(raw: any): LandingGalleryConfig | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    source: raw.source === "folder" ? "folder" : "manual",
    folder: raw.folder ? String(raw.folder) : null,
    images: Array.isArray(raw.images)
      ? raw.images.filter((id: any) => typeof id === "string" && id).map((id: any) => String(id))
      : [],
    caption: raw.caption ? String(raw.caption) : undefined,
  };
}

/**
 * The effective Location section config — the admin-authored `location`, with
 * any unset score/highlights falling back to the legacy `places` data so an org
 * that only ever filled the Neighborhood widget still gets a rich Location
 * section. Pure; safe to call on a normalized config.
 */
export function resolveLocationConfig(cfg: LandingConfig): LandingLocationConfig {
  const loc = cfg.location;
  const places = cfg.places || { neighborhood: "", walk_score: null, bike_score: null, items: [] };
  const highlights =
    loc && loc.highlights.length ? loc.highlights : Array.isArray(places.items) ? places.items : [];
  return {
    heading: loc?.heading || (places.neighborhood ? `The ${places.neighborhood} Neighborhood` : ""),
    intro: loc?.intro || "",
    walk_score: loc?.walk_score ?? numOrNull(places.walk_score),
    bike_score: loc?.bike_score ?? numOrNull(places.bike_score),
    transit_score: loc?.transit_score ?? null,
    highlights,
    stats: loc?.stats || [],
    walk_times: loc?.walk_times || [],
    lifestyle: loc?.lifestyle || null,
  };
}

/** Whether the Location section has anything worth rendering. */
export function hasLocationContent(loc: LandingLocationConfig, hasGeo: boolean): boolean {
  return (
    hasGeo ||
    loc.walk_score != null ||
    loc.bike_score != null ||
    loc.transit_score != null ||
    (loc.walk_times?.length ?? 0) > 0 ||
    (loc.lifestyle?.items?.length ?? 0) > 0 ||
    !!loc.intro ||
    loc.highlights.length > 0 ||
    loc.stats.length > 0
  );
}

/** The enabled widget keys, in display order. */
export function enabledLandingWidgets(cfg: LandingConfig): LandingWidgetKey[] {
  return cfg.widgets.filter((w) => w.enabled).map((w) => w.key);
}

/** The enabled blocks, in display order. */
export function enabledLandingBlocks(cfg: LandingConfig): LandingBlock[] {
  return (cfg.blocks || []).filter((b) => b.enabled);
}

/** One rendered entry in the landing flow — the block plus its display metadata. */
export interface LandingRenderBlock {
  block: LandingBlock;
  /** Alternate background among content sections (editorial rhythm). */
  alt: boolean;
  /** Two-digit narrative number ("01") for narrative-capable sections, else "". */
  number: string;
}

/**
 * Walk the enabled blocks in order, assigning the editorial rhythm: content
 * sections alternate background, and the narrative-capable sections
 * (content/location/gallery) receive a sequential two-digit number for the
 * classic/luxury numbered narrative. A content block's own `number_label`, when
 * set, wins over the sequential number. The other built-ins keep `number: ""`.
 */
export function narrativeSections(cfg: LandingConfig): LandingRenderBlock[] {
  let contentIdx = 0;
  let narrIdx = 0;
  return enabledLandingBlocks(cfg).map((block) => {
    const alt = block.type === "content" ? contentIdx++ % 2 === 1 : false;
    let number = "";
    if (NARRATIVE_BLOCK_TYPES.includes(block.type)) {
      narrIdx += 1;
      const own = block.number_label?.trim();
      number = own || String(narrIdx).padStart(2, "0");
    }
    return { block, alt, number };
  });
}

function numOrNull(v: any): number | null {
  return isFiniteNum(v) ? Number(v) : null;
}
function isFiniteNum(v: any): boolean {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
}
