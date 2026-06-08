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
  | "contact";

/** Built-in block types carry no data of their own (data lives elsewhere). */
export const BUILTIN_BLOCK_TYPES: LandingBlockType[] = [
  "about",
  "amenities",
  "listings",
  "faq",
  "board",
  "contact",
];

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
}

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
}

export interface LandingConfig {
  widgets: LandingWidgetPref[];
  places: LandingPlaces;
  listings: LandingListing[];
  /** Frequently-asked questions, rendered as an editorial accordion section. */
  faq: LandingFaqItem[];
  /** The ordered, admin-controlled list of landing sections. */
  blocks: LandingBlock[];
  inquiry: LandingInquiryConfig;
  geo?: LandingGeo | null;
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
    widgets: defaultLandingWidgets(),
    places: { neighborhood: "", walk_score: null, bike_score: null, items: [] },
    listings: [],
    faq: [],
    blocks: defaultLandingBlocks(),
    inquiry: { enabled: true, recipient_type: "email", email: null, user: null },
    geo: null,
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

  return {
    widgets,
    places,
    listings,
    faq,
    blocks,
    inquiry,
    geo,
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
        }))
    : [];
  return block;
}

/** The enabled widget keys, in display order. */
export function enabledLandingWidgets(cfg: LandingConfig): LandingWidgetKey[] {
  return cfg.widgets.filter((w) => w.enabled).map((w) => w.key);
}

/** The enabled blocks, in display order. */
export function enabledLandingBlocks(cfg: LandingConfig): LandingBlock[] {
  return (cfg.blocks || []).filter((b) => b.enabled);
}

function numOrNull(v: any): number | null {
  return isFiniteNum(v) ? Number(v) : null;
}
function isFiniteNum(v: any): boolean {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
}
