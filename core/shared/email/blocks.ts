// The email block-builder's shared vocabulary (Phase 6 — see
// docs/plan-earnest-parity-upgrade.md). Pure and framework-free so the same
// code assembles MJML on the client (live canvas preview) and validates on the
// server (/api/email/assemble). Ported from Earnest's shared/email/blocks.ts and
// adapted to HOA Connect's hoa_newsletter_blocks collection.
//
// Two variable layers compose cleanly and must NOT be conflated:
//   • design-time  {{{key}}}  — a block's own slots, substituted here at assemble
//   • per-recipient {{token}} — HOA merge fields, applied later by the send path
// Assembling only ever touches the triple-brace layer, leaving {{tokens}} intact.

import type { HoaNewsletterBlock } from "../../types/directus";

/** The kinds of slot a block variable can be — drives the editor's field UI. */
export type BlockVariableType = "text" | "html" | "url" | "color" | "image" | "boolean";

/** One entry in a block's variables_schema. */
export interface BlockVariableDefinition {
  key: string;
  label: string;
  type: BlockVariableType;
  default?: string;
  required?: boolean;
  description?: string;
}

/** A block placed on the builder canvas — a hydrated block + its instance values. */
export interface CanvasBlock {
  /** Client-only stable key (nanoid). Never persisted; canvas order is `sort`. */
  instanceId: string;
  /** FK → hoa_newsletter_blocks.id */
  blockId: string;
  /** The hydrated library block (its mjml_source + schema). */
  block: HoaNewsletterBlock;
  /** Per-instance variable overrides keyed by schema key. */
  variables: Record<string, any>;
  sort: number;
}

/** The block categories, matching the collection's `category` enum. */
export const BLOCK_CATEGORIES = [
  "header", "hero", "content", "two-column", "cta", "image",
  "stats", "quote", "list", "divider", "social", "footer",
] as const;
export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

/** Infer a variable's type from its key when a schema doesn't spell it out. */
function inferType(key: string): BlockVariableType {
  const k = key.toLowerCase();
  if (/color|bg|background/.test(k)) return "color";
  if (/url|link|href/.test(k)) return "url";
  if (/image|img|src|logo|photo|avatar|banner/.test(k)) return "image";
  if (/html|body|content|description/.test(k)) return "html";
  return "text";
}

/** Extract {{{key}}} slots from an MJML source, in first-seen order. */
export function extractSlots(mjml: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{\{\s*([a-zA-Z0-9_]+)\s*\}\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mjml))) {
    const key = m[1]!;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** Build a schema by inferring one entry per {{{slot}}} found in the MJML. */
export function inferVariablesFromMjml(mjml: string): BlockVariableDefinition[] {
  return extractSlots(mjml).map((key) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    type: inferType(key),
    default: "",
  }));
}

/**
 * Normalize a block's variables_schema into a typed definition array. Accepts an
 * already-parsed array, a JSON string, or null/empty (→ inferred from the MJML).
 */
export function parseVariablesSchema(
  raw: unknown,
  mjmlSource?: string | null
): BlockVariableDefinition[] {
  let parsed: any = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (Array.isArray(parsed) && parsed.length) {
    return parsed
      .filter((d) => d && typeof d.key === "string")
      .map((d) => ({
        key: d.key,
        label: d.label || d.key,
        type: (["text", "html", "url", "color", "image", "boolean"].includes(d.type) ? d.type : inferType(d.key)) as BlockVariableType,
        default: d.default ?? "",
        required: !!d.required,
        description: d.description,
      }));
  }
  return mjmlSource ? inferVariablesFromMjml(mjmlSource) : [];
}

/** The out-of-the-box value for a variable of a given type. */
export function typeDefault(type: BlockVariableType, key: string): string {
  if (type === "color") return /text|foreground/.test(key.toLowerCase()) ? "#333333" : "transparent";
  if (type === "boolean") return "false";
  return "";
}

/** Seed an instance's variables from a block's schema defaults. */
export function getDefaultVariables(block: HoaNewsletterBlock): Record<string, any> {
  const schema = parseVariablesSchema(block.variables_schema, block.mjml_source);
  const out: Record<string, any> = {};
  for (const def of schema) {
    out[def.key] = def.default != null && def.default !== "" ? def.default : typeDefault(def.type, def.key);
  }
  return out;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Resolve one variable value for substitution, snapping invalid colors safe. */
function resolveValue(value: any, type: BlockVariableType, key: string): string {
  const v = value == null ? "" : String(value);
  if (type === "color") {
    if (v === "transparent") return "transparent";
    if (HEX_RE.test(v)) return v;
    // An invalid color on a text slot would break rendering — fall back readable.
    return /text|foreground/.test(key.toLowerCase()) ? "#333333" : "transparent";
  }
  return v;
}

/**
 * Substitute a block's {{{key}}} design-time slots with its instance values.
 * Any slot left unfilled is emptied so MJML won't choke on a raw `{{{token}}}`.
 * Per-recipient {{merge_fields}} (double-brace) are deliberately untouched.
 */
export function substituteBlock(block: HoaNewsletterBlock, variables: Record<string, any>): string {
  const schema = parseVariablesSchema(block.variables_schema, block.mjml_source);
  const typeByKey = new Map(schema.map((d) => [d.key, d.type] as const));
  let out = String(block.mjml_source || "");
  for (const key of extractSlots(out)) {
    const type = typeByKey.get(key) ?? inferType(key);
    const resolved = resolveValue(variables?.[key], type, key);
    out = out.split(`{{{${key}}}}`).join(resolved);
  }
  // Drop any remaining triple-brace tokens (schema/source mismatch guard).
  return out.replace(/\{\{\{[^}]*\}\}\}/g, "");
}

export interface AssembleOptions {
  backgroundColor?: string;
  fontFamily?: string;
}

/**
 * Assemble an ordered canvas into one <mjml> document. Mirrors the wrapper the
 * server's /api/email/assemble route builds, so a client-assembled preview and
 * the delivered email agree.
 */
export function assembleMjml(blocks: CanvasBlock[], opts: AssembleOptions = {}): string {
  const bg = opts.backgroundColor || "#f4f4f4";
  const font = opts.fontFamily || "Helvetica, Arial, sans-serif";
  const rendered = [...blocks]
    .sort((a, b) => a.sort - b.sort)
    .map((b) => substituteBlock(b.block, b.variables))
    .filter((s) => s.trim())
    .join("\n");
  return [
    "<mjml>",
    `<mj-head><mj-attributes><mj-all font-family="${font}" /></mj-attributes></mj-head>`,
    `<mj-body background-color="${bg}">`,
    rendered,
    "</mj-body>",
    "</mjml>",
  ].join("\n");
}

// ── AI wizard contract ────────────────────────────────────────────────────────
// The structured JSON the /api/email/ai-generate route returns; each section is
// matched to a real library block and dropped on the canvas.

export interface AiGeneratedSection {
  /** Must match a library block's category. */
  blockCategory: string;
  /** Should match a library block's name (falls back to category). */
  blockName?: string;
  /** Variable values keyed by that block's schema keys. */
  variables: Record<string, string>;
}

export interface AiGeneratedEmail {
  subject: string;
  previewText?: string;
  sections: AiGeneratedSection[];
}
