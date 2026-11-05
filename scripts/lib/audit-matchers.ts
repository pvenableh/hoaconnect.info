/**
 * The PURE matchers behind the `scripts/audit-*.ts` gates. No filesystem, no
 * git — a source string in, `{ line, text }[]` out — so
 * `tests/scripts/audit-matchers.test.ts` can table-test every rule (a hit, a
 * near miss, the allow marker) without touching the tree.
 *
 * Each matcher is RE-CENSUSED AGAINST THIS APP'S SPELLING. The round-2 lesson:
 * Earnest's hairline regex matched nothing here until it was rewritten for
 * `t-border`, and reported a clean repo. HOA Connect's idioms are the theme
 * classes (`t-bg-*`, `t-text-*`, `t-border`), the glass classes (`ios-card`,
 * `glass-*`) and the `type-*` scale — not shadcn's `bg-card` / `border-border`.
 */
import { blankComments, hasMarker } from "./audit-kit";

export interface Hit {
  line: number;
  text: string;
  key?: string;
}

const trim = (s: string) => s.trim().slice(0, 110);

/** Run a per-line test over comment-blanked source, honouring an `allow-*` marker. */
function scanLines(
  src: string,
  kind: "vue" | "ts" | "css",
  marker: string | null,
  test: (line: string, i: number, lines: string[], raw: string[]) => Hit["key"] | boolean | null | undefined,
  lookback = 2,
): { hits: Hit[]; allowed: number } {
  const raw = src.split("\n");
  const lines = blankComments(src, kind).split("\n");
  const hits: Hit[] = [];
  let allowed = 0;
  lines.forEach((line, i) => {
    const r = test(line, i, lines, raw);
    if (!r) return;
    if (marker && hasMarker(raw, i, marker, lookback)) {
      allowed += 1;
      return;
    }
    hits.push({ line: i + 1, text: trim(raw[i] ?? ""), key: typeof r === "string" ? r : undefined });
  });
  return { hits, allowed };
}

/** Everything between `<template>` and its matching close — i.e. not `<script>` / `<style>`. */
export function templateOnly(src: string): string {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i += 1) if (out[i] !== "\n") out[i] = " ";
  };
  for (const m of src.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g)) blank(m.index!, m.index! + m[0].length);
  return out.join("");
}

/** The `<style>` blocks of an SFC as `{ body, startLine }` (1-based line of the first body line). */
export function styleBlocks(src: string): { body: string; startLine: number; scoped: boolean }[] {
  const out: { body: string; startLine: number; scoped: boolean }[] = [];
  for (const m of src.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
    const bodyStart = m.index! + m[0].indexOf(">") + 1;
    out.push({
      body: m[2] ?? "",
      startLine: src.slice(0, bodyStart).split("\n").length,
      scoped: /\bscoped\b/.test(m[1] ?? ""),
    });
  }
  return out;
}

/* ───────────────────────────── native-dialogs ───────────────────────────── */

/**
 * `confirm(` / `alert(` / `prompt(` — the browser's own dialogs.
 *
 * ⚠️ `useConfirm()` hands back a function that is ALSO called `confirm`
 * (`const { confirm } = useConfirm(); await confirm({ … })`), so a bare name
 * match is a false positive factory. What separates them is the argument: the
 * native one takes a STRING (literal, template or concatenation), ours takes
 * an options OBJECT. `window.`/`globalThis.` prefixed is always native.
 * Declarations (`function confirm(`, `confirm:`/`confirm(` as a method name
 * after `.`) are not calls.
 */
export const NATIVE_DIALOG_MARKER = "allow-native-dialog";
const NATIVE_QUALIFIED = /\b(?:window|globalThis|self)\.(confirm|alert|prompt)\s*\(\s*[^)\s]/;
const NATIVE_BARE = /(?<![\w$.])(confirm|alert|prompt)\s*\(\s*(["'`]|[A-Za-z_$][\w$]*\s*\+)/;

export function findNativeDialogs(src: string, kind: "vue" | "ts" = "vue") {
  return scanLines(src, kind, NATIVE_DIALOG_MARKER, (line) => {
    if (/\bfunction\s+(confirm|alert|prompt)\b/.test(line)) return false;
    return NATIVE_QUALIFIED.test(line) || NATIVE_BARE.test(line);
  });
}

/* ──────────────────────────── raw-date-inputs ──────────────────────────── */

export const RAW_DATE_MARKER = "allow-raw-date-input";
const RAW_DATE_STATIC = /(?<![\w-])type\s*=\s*["'](date|datetime-local|month|week)["']/;
const RAW_DATE_BOUND = /:type\s*=\s*"\s*'(date|datetime-local|month|week)'\s*"/;

export function findRawDateInputs(src: string) {
  return scanLines(src, "vue", RAW_DATE_MARKER, (line) => RAW_DATE_STATIC.test(line) || RAW_DATE_BOUND.test(line));
}

/* ───────────────────────────── color-literals ───────────────────────────── */

/**
 * Tailwind PALETTE classes (`text-gray-500`, `bg-emerald-600`) — the colour is
 * welded into the class and ignores the theme, so it never flips with dark mode
 * or the org accent. Semantic tokens (`t-text-*`, `text-destructive`,
 * `bg-success/15`) are what replace them.
 */
export const COLOR_LITERAL_MARKER = "allow-color-literal";
const RAMPS = [
  "gray", "grey", "slate", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime", "green",
  "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
];
const PREFIXES = [
  "bg", "text", "border", "border-[xytblr]", "ring", "ring-offset", "outline", "fill", "stroke", "from", "via", "to",
  "divide", "placeholder", "decoration", "accent", "caret", "shadow",
];
const COLOR_LITERAL = new RegExp(
  `(?<![\\w-])(?:${PREFIXES.join("|")})-(?:${RAMPS.join("|")})-(?:50|100|200|300|400|500|600|700|800|900|950)(?![\\w-])`,
);
/** `bg-white` / `text-black` — pure white and black ignore the theme just as hard. */
const BW_LITERAL = /(?<![\w-])(?:bg|text|border|ring|fill|stroke)-(?:white|black)(?![\w-])/;

export function findColorLiterals(src: string, kind: "vue" | "ts" = "vue") {
  return scanLines(src, kind, COLOR_LITERAL_MARKER, (line) => {
    const m = COLOR_LITERAL.exec(line) ?? BW_LITERAL.exec(line);
    return m ? m[0] : null;
  });
}

/* ────────────────────────────── css-colors ─────────────────────────────── */

export const CSS_COLOR_MARKER = "allow-css-color";
const CSS_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\((?!\s*var\()/;
/** A custom-property DECLARATION is a token definition — that is where literals belong. */
const CUSTOM_PROPERTY_DECL = /^\s*--[\w-]+\s*:/;

export function findCssColors(body: string, startLine = 1) {
  const r = scanLines(body, "css", CSS_COLOR_MARKER, (line) => {
    if (CUSTOM_PROPERTY_DECL.test(line)) return false;
    // `url(#gradient)` / `&#39;`-style fragments: a `#` right after `(` or `&` is not a colour.
    const stripped = line.replace(/url\([^)]*\)/g, "").replace(/&#\w+;/g, "");
    return CSS_LITERAL.test(stripped);
  });
  return { allowed: r.allowed, hits: r.hits.map((h) => ({ ...h, line: h.line + startLine - 1 })) };
}

/* ──────────────────────────── dead-theme-classes ───────────────────────── */

export const THEME_FAMILIES = ["t", "glass", "ios", "type"];

/** Class tokens defined by a stylesheet: `.t-text-primary`, `@utility t-bg-subtle`. */
export function definedClasses(css: string): Set<string> {
  const out = new Set<string>();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const fam = THEME_FAMILIES.join("|");
  for (const m of clean.matchAll(new RegExp(`\\.((?:${fam})-[a-z][a-z0-9-]*)`, "g"))) out.add(m[1]!);
  for (const m of clean.matchAll(new RegExp(`@utility\\s+((?:${fam})-[a-z][a-z0-9-]*)`, "g"))) out.add(m[1]!);
  return out;
}

export const DEAD_CLASS_MARKER = "allow-dead-class";
const USED_CLASS = new RegExp(`(?<![\\w-./#\\[])(?:${THEME_FAMILIES.join("|")})-[a-z][a-z0-9-]*`, "g");

/**
 * Theme-family class tokens used inside a `class="…"` / `:class` / `class: '…'`
 * attribute-ish context, and not in `defined`. Restricting to attribute text is
 * what stops `t-1` in prose, a `type-` prefix in a route name, or a CSS
 * variable from being counted as a class.
 */
export function findDeadThemeClasses(
  src: string,
  defined: Set<string>,
  dynamicOk: (cls: string) => boolean = () => false,
  strict = false,
) {
  const raw = src.split("\n");
  const lines = blankComments(src, "vue").split("\n");
  const hits: Hit[] = [];
  let allowed = 0;
  lines.forEach((line, i) => {
    if (!/class|ui\s*=|:ui|cn\(|clsx|tw`/i.test(line) && (strict || !/["'`][^"'`]*\b(?:t|glass|ios|type)-[a-z]/.test(line))) return;
    const seen = new Set<string>();
    for (const m of line.matchAll(USED_CLASS)) {
      const cls = m[0].replace(/-+$/, "");
      if (seen.has(cls)) continue;
      seen.add(cls);
      // Template-literal prefix `t-text-${x}` leaves a trailing dash — not a class.
      if (/\$\{/.test(line.slice(m.index! + m[0].length, m.index! + m[0].length + 2))) continue;
      if (defined.has(cls) || dynamicOk(cls)) continue;
      if (hasMarker(raw, i, DEAD_CLASS_MARKER, 2)) {
        allowed += 1;
        continue;
      }
      hits.push({ line: i + 1, text: trim(raw[i] ?? ""), key: cls });
    }
  });
  return { hits, allowed };
}

/* ──────────────────────────── unresolved-components ────────────────────── */

const HTML_TAGS = new Set(
  (
    "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup " +
    "data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 " +
    "head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript " +
    "object ol optgroup option output p param picture pre progress q rp rt ruby s samp script section select slot small " +
    "source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var " +
    "video wbr svg path g circle rect line polyline polygon ellipse defs lineargradient radialgradient stop clippath mask " +
    "text tspan use symbol filter fegaussianblur feoffset feblend femerge femergenode fecolormatrix feflood fecomposite " +
    "pattern image foreignobject marker animate animatetransform desc " +
    "component transition transitiongroup keepalive teleport suspense"
  ).split(" "),
);

/** Nuxt / vue-router built-ins that are not in `components.d.ts` as plain names. */
const BUILTIN_COMPONENTS = new Set([
  "NuxtLink", "NuxtPage", "NuxtLayout", "NuxtLoadingIndicator", "NuxtErrorBoundary", "NuxtRouteAnnouncer",
  "NuxtImg", "NuxtPicture", "NuxtIsland", "ClientOnly", "DevOnly", "NuxtWelcome", "NuxtPwaManifest",
  "RouterLink", "RouterView", "Transition", "TransitionGroup", "KeepAlive", "Teleport", "Suspense", "Component",
  "NuxtTime", "NuxtAnnouncer", "NuxtClientFallback", "NuxtRouteAnnouncer", "ServerPlaceholder",
]);

export const UNRESOLVED_MARKER = "allow-unresolved-component";

const pascal = (tag: string) => tag.replace(/(^|-)([a-zA-Z0-9])/g, (_, __, c: string) => c.toUpperCase());

/** Component names declared by `components.d.ts` lines: `export const Foo: typeof import(...)`. */
export function parseComponentNames(dts: string): Set<string> {
  const out = new Set<string>();
  for (const m of dts.matchAll(/export const (\w+):/g)) {
    const name = m[1]!;
    out.add(name.startsWith("Lazy") ? name.slice(4) : name);
  }
  return out;
}

/** Names the SFC brings into scope itself (`import Foo from`, `import { Foo }`, `const Foo =`). */
function localNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/import\s+(?:type\s+)?([\w$]+)(?:\s*,\s*\{([^}]*)\})?\s+from/g)) {
    out.add(m[1]!);
    for (const n of (m[2] ?? "").split(",")) out.add(n.trim().split(/\s+as\s+/).pop()!.trim());
  }
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from/g))
    for (const n of m[1]!.split(",")) out.add(n.trim().split(/\s+as\s+/).pop()!.trim());
  for (const m of src.matchAll(/\b(?:const|let|var|function)\s+([A-Z][\w$]*)\b/g)) out.add(m[1]!);
  return out;
}

export function findUnresolvedComponents(src: string, known: Set<string>) {
  // Blank quoted ATTRIBUTE values: `placeholder="<mj-body>…"` is text, not markup.
  const tpl = blankComments(templateOnly(src), "vue").replace(/(\s[:@#\w.-]+\s*=\s*)"[^"]*"/g, (m, a: string) =>
    a + '"' + m.slice(a.length + 1, -1).replace(/[^\n]/g, " ") + '"',
  );
  const local = localNames(src);
  const raw = src.split("\n");
  const hits: Hit[] = [];
  let allowed = 0;
  tpl.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/<([A-Za-z][\w.-]*)(?=[\s/>]|$)/g)) {
      const tag = m[1]!;
      if (tag.includes(".")) continue; // `<motion.div>`-style namespaced
      const isPascal = /^[A-Z]/.test(tag);
      if (!isPascal && !tag.includes("-")) {
        if (HTML_TAGS.has(tag.toLowerCase())) continue;
        continue; // single lowercase word that isn't html: custom element — not our concern
      }
      if (!isPascal && /^(svg|math)-/.test(tag)) continue;
      const name = pascal(tag);
      if (known.has(name) || BUILTIN_COMPONENTS.has(name) || local.has(name) || local.has(tag)) continue;
      if (HTML_TAGS.has(tag.toLowerCase())) continue;
      if (hasMarker(raw, i, UNRESOLVED_MARKER, 2)) {
        allowed += 1;
        continue;
      }
      hits.push({ line: i + 1, text: trim(raw[i] ?? ""), key: name });
    }
  });
  return { hits, allowed };
}

/* ───────────────────────────── heading-labels ──────────────────────────── */

/**
 * A `<hN>` dressed as a micro label — uppercase + tracking at caption size.
 * Headings are for the document outline; a label is a `<p>` / `<span>` with
 * `type-label` / `type-eyebrow`. Screen readers announce the heading, so a
 * decorative label inflates the outline.
 */
export const HEADING_LABEL_MARKER = "allow-heading-label";
const HEADING_TAG = /<(h[1-6])\b([^>]*)>/g;
const LABEL_SIZE = /(?<![\w-])(?:text-\[(?:9|10|11|12)px\]|text-xs)(?![\w-])|(?<![\w-])type-(?:label|caption|eyebrow|overline)(?![\w-])/;
const LABEL_STYLE = /(?<![\w-])uppercase(?![\w-])|(?<![\w-])tracking-(?:wide|wider|widest)(?![\w-])|\[letter-spacing:/;

export function findHeadingLabels(src: string) {
  const tpl = templateOnly(src);
  const raw = src.split("\n");
  const hits: Hit[] = [];
  let allowed = 0;
  for (const m of tpl.matchAll(HEADING_TAG)) {
    const attrs = m[2] ?? "";
    const cls = /(?:^|\s):?class\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (!cls) continue;
    // A real label needs BOTH the casing/tracking AND the caption size.
    if (!(LABEL_STYLE.test(cls) && LABEL_SIZE.test(cls))) continue;
    const line = tpl.slice(0, m.index).split("\n").length;
    if (hasMarker(raw, line - 1, HEADING_LABEL_MARKER, 2)) {
      allowed += 1;
      continue;
    }
    hits.push({ line, text: trim(raw[line - 1] ?? ""), key: m[1] });
  }
  return { hits, allowed };
}

/* ─────────────────────────────── raw-buttons ───────────────────────────── */

/**
 * A bare `<button>` — outside the shared button tiers (`ui/button`, `ActionButton`
 * …). The tiers carry the focus ring, the press state, the haptic and the
 * disabled treatment; a raw one has to re-do all of it and usually doesn't.
 */
export const RAW_BUTTON_MARKER = "allow-raw-button";
export function findRawButtons(src: string) {
  const tpl = templateOnly(src);
  const raw = src.split("\n");
  const lines = blankComments(tpl, "vue").split("\n");
  const hits: Hit[] = [];
  let allowed = 0;
  lines.forEach((line, i) => {
    if (!/<button(?=[\s>]|$)/.test(line)) return;
    if (hasMarker(raw, i, RAW_BUTTON_MARKER, 2)) {
      allowed += 1;
      return;
    }
    hits.push({ line: i + 1, text: trim(raw[i] ?? "") });
  });
  return { hits, allowed };
}

/* ─────────────────────────────── type-scale ────────────────────────────── */

/**
 * Raw pixel typography. The scale is `type-*` (and Tailwind's `text-xs…`).
 * `text-[13px]` / `leading-[15px]` / `font-size: 13px` are one-offs that drift.
 */
export const TYPE_SCALE_MARKER = "allow-type-px";
const TEMPLATE_PX = /(?<![\w-])(?:text|leading)-\[\d+(?:\.\d+)?px\]/g;
const FONT_SIZE_DECL = /(?<![\w-])font-size\s*:(?!\s*var\()/;

export function findRawTypeSizes(src: string) {
  const raw = src.split("\n");
  const hits: Hit[] = [];
  let allowed = 0;
  const tpl = blankComments(templateOnly(src), "vue").split("\n");
  tpl.forEach((line, i) => {
    const m = line.match(TEMPLATE_PX);
    if (!m) return;
    if (hasMarker(raw, i, TYPE_SCALE_MARKER, 2)) {
      allowed += m.length;
      return;
    }
    for (const x of m) hits.push({ line: i + 1, text: trim(raw[i] ?? ""), key: x });
  });
  for (const b of styleBlocks(src)) {
    blankComments(b.body, "css")
      .split("\n")
      .forEach((line, j) => {
        if (!FONT_SIZE_DECL.test(line)) return;
        const at = b.startLine - 1 + j;
        // The `.type-*` classes themselves define the scale in a stylesheet, but a
        // `<style>` block that does so is rare; a tagged one is the exemption.
        if (hasMarker(raw, at, TYPE_SCALE_MARKER, 3)) {
          allowed += 1;
          return;
        }
        hits.push({ line: at + 1, text: trim(raw[at] ?? ""), key: "font-size" });
      });
  }
  return { hits, allowed };
}

/* ─────────────────────────────── empty-states ──────────────────────────── */

/**
 * Bare "No X yet" copy outside `App/EmptyState`. EmptyState carries the icon,
 * the one-line reason and the call to action; a naked `<p>No requests yet</p>`
 * is a dead end.
 *
 * Search/filter outcomes ("No results", "No matches") are NOT empty states —
 * they are about a query, not an empty collection.
 */
export const EMPTY_STATE_MARKER = "allow-bare-empty";
const BLANK_COPY = /\bNo [A-Za-z][A-Za-z' -]{2,34} (?:yet|found|available|on file|to show|to display)\b/;
const NO_MATCH = /^No (?:results|matches|matching)\b/;
const EMPTY_STATE_TAG = /<(?:AppEmptyState|EmptyState|AppsEmptyState)\b/g;

/** Line ranges covered by an `<EmptyState …>…</EmptyState>` or its self-closing form. */
function emptyStateLines(tpl: string): Set<number> {
  const covered = new Set<number>();
  for (const m of tpl.matchAll(EMPTY_STATE_TAG)) {
    const start = tpl.slice(0, m.index).split("\n").length - 1;
    const rest = tpl.slice(m.index);
    const closeTag = /<\/(?:AppEmptyState|EmptyState|AppsEmptyState)>/.exec(rest);
    const selfClose = /\/>/.exec(rest);
    const endOff = closeTag && (!selfClose || closeTag.index < selfClose.index + 400) ? closeTag.index + closeTag[0].length : (selfClose?.index ?? 0) + 2;
    const end = start + rest.slice(0, endOff).split("\n").length - 1;
    for (let l = start; l <= end; l += 1) covered.add(l);
  }
  return covered;
}

export function findBareEmptyStates(src: string) {
  const tpl = blankComments(templateOnly(src), "vue");
  const raw = src.split("\n");
  const covered = emptyStateLines(tpl);
  const hits: Hit[] = [];
  let allowed = 0;
  tpl.split("\n").forEach((line, i) => {
    if (covered.has(i)) return;
    const m = BLANK_COPY.exec(line);
    if (!m) return;
    if (NO_MATCH.test(m[0])) return;
    // `empty-title="No members yet"` is a PROP of a component that owns its empty state (a chart).
    if (/(?:empty|fallback)-[a-z]+\s*=\s*["'][^"']*$/.test(line.slice(0, m.index! + m[0].length))) return;
    if (hasMarker(raw, i, EMPTY_STATE_MARKER, 2)) {
      allowed += 1;
      return;
    }
    hits.push({ line: i + 1, text: trim(raw[i] ?? ""), key: m[0] });
  });
  return { hits, allowed };
}

/* ─────────────────────────────── vue-global ────────────────────────────── */

/**
 * `:global(.dark) .child` inside `<style scoped>` — Vue's compiler keeps only
 * what's INSIDE `:global(…)` and silently drops the rest, so the rule matches
 * `.dark` everywhere instead of `.dark .child`. Wrap the whole selector:
 * `:global(.dark .child)`.
 */
const BAD_GLOBAL = /:global\([^)]*\)\s*(?![\s]*[,{])\S/;
export function findBrokenGlobals(src: string) {
  const hits: Hit[] = [];
  for (const b of styleBlocks(src)) {
    blankComments(b.body, "css")
      .split("\n")
      .forEach((line, j) => {
        if (!line.includes(":global(")) return;
        // `:global(.a) { … }` and `:global(.a), …` are fine; a compound after it is not.
        if (BAD_GLOBAL.test(line.replace(/\{.*$/, "{"))) {
          const at = b.startLine - 1 + j;
          hits.push({ line: at + 1, text: trim(src.split("\n")[at] ?? "") });
        }
      });
  }
  return { hits, allowed: 0 };
}

/* ───────────────────────────── detached-promises ───────────────────────── */

/**
 * Work started in a request handler and not awaited. On Vercel the function is
 * frozen the moment the response is sent, so a `void notify(…)` or a floating
 * `.catch()` silently never finishes — the "notification that never arrived"
 * class of bug.
 *
 * Flags: `void <call>` (not `void 0`), `.then(` / `.catch(` chains that start a
 * statement without `await`/`return`, and a bare `waitUntil(`.
 * Tag a genuinely intentional fire-and-forget `allow-detached-promise: <why>`.
 */
export const DETACHED_MARKER = "allow-detached-promise";
const VOID_CALL = /(?:^|[^\w.$])void\s+(?!0\b)[A-Za-z_$(]/;
const WAIT_UNTIL = /(?:^|[^\w.$])(?:event\.)?waitUntil\s*\(/;
const FLOATING_CHAIN = /^(?!\s*(?:await|return|const|let|var|throw|yield)\b|\s*[)]|\s*\.\.\.)\s*[\w$.]+\(.*\)\s*\.(?:then|catch)\s*\(/;

export function findDetachedPromises(src: string) {
  return scanLines(src, "ts", DETACHED_MARKER, (line) => {
    if (/^\s*(\/\/|\*)/.test(line)) return false;
    // `rows.map(x => f(x).catch(…))` is collected by an `await Promise.all(…)` around it.
    const collected = /\.map\(|Promise\.(?:all|allSettled|race)/.test(line);
    return VOID_CALL.test(line) || WAIT_UNTIL.test(line) || (!collected && FLOATING_CHAIN.test(line));
  });
}

/* ──────────────────────────────── nested boxes ─────────────────────────── */

/**
 * Card-in-card detection for the overlay-boxes and settings-boxes audits.
 * A "box" is anything that paints its own surface: `ios-card`, `glass-edge`,
 * a `<Card>`, a tinted `bg-muted … rounded-xl p-4`, or a hand-bordered one.
 * Inside an overlay (sheet, modal, slide-over) the overlay IS the card, and on
 * a settings tab the page is — a second box is a card in a card.
 */
export const NESTED_BOX_MARKER = "allow-nested-box";
export interface BoxHit extends Hit {
  kind: "ios-card" | "Card" | "glass-edge" | "tinted" | "bordered";
}

const IOS_CARD = /(?<![\w-])ios-card(?![\w-])/;
const THING = /(?<![\w-])ios-card--thing(?![\w-])/;
const CARD_TAG = /<Card\b/;
const GLASS_EDGE = /(?<![\w-])glass-edge(?![\w-])/;
const TINT = /(?<![:\w-])(?:bg-(?:muted|secondary|accent)(?![\w-]*-foreground)|t-bg-(?:subtle|secondary|tertiary))(?![\w-])/;
const FULL_BORDER = /(?<![:\w-])border(?![\w-])/;
const BOXY_RADIUS = /(?<![:\w-])rounded-(sm|md|lg|xl|2xl|3xl|\[[\d.]+(px|rem)\])/;
const PADDING = /(?<![:\w-])p[xy]?-(\d|\[)/;
const PILL = /(?<![:\w-])rounded-full\b/;
const CHIP_SIZED = /(?<![:\w-])(h-[3-7]|p-1|p-1\.5|px-1|px-1\.5|px-2)(?![\w.-])/;
const FLOATING_BOX = /\bbg-popover\b|(?<![:\w-])(absolute|fixed)(?![\w-])/;
const FUNCTIONAL_BORDER = /(hover|focus|focus-within|active|group-hover|data-\[[^\]]+\]):border-/;
const TAG_CONTROL = /<(input|textarea|select|button)\b/;
const FORM_FIELD = /\b(resize-none|placeholder:|focus:ring-|focus-within:|caret-)/;

function ownerIsControl(raw: string[], i: number): boolean {
  for (let back = 0; back <= 10; back += 1) {
    const line = raw[i - back];
    if (line === undefined) return false;
    if (TAG_CONTROL.test(line)) return true;
    if (/<[a-zA-Z][a-zA-Z0-9-]*/.test(line)) return false;
  }
  return false;
}

export function findBoxes(src: string, region?: Set<number>): { findings: BoxHit[]; things: number } {
  const raw = src.split("\n");
  const lines = blankComments(templateOnly(src), "vue").split("\n");
  const findings: BoxHit[] = [];
  let things = 0;
  lines.forEach((line, i) => {
    if (region && !region.has(i)) return;
    let kind: BoxHit["kind"] | null = null;
    if (IOS_CARD.test(line)) kind = "ios-card";
    else if (CARD_TAG.test(line)) kind = "Card";
    else if (GLASS_EDGE.test(line)) kind = "glass-edge";
    else if (TINT.test(line) && BOXY_RADIUS.test(line) && PADDING.test(line)) kind = "tinted";
    else if (FULL_BORDER.test(line) && BOXY_RADIUS.test(line) && PADDING.test(line)) kind = "bordered";
    if (!kind) return;
    if (THING.test(line) || hasMarker(raw, i, NESTED_BOX_MARKER, 6)) return void (things += 1);
    if (kind !== "Card" && ownerIsControl(raw, i)) return;
    if (FLOATING_BOX.test(line) || FORM_FIELD.test(line)) return;
    if (kind !== "ios-card" && kind !== "Card") {
      if (PILL.test(line) || CHIP_SIZED.test(line)) return;
      if (kind === "bordered" && FUNCTIONAL_BORDER.test(line)) return;
    }
    findings.push({ line: i + 1, kind, text: trim(raw[i] ?? "") });
  });
  return { findings, things };
}

/** Overlay primitives — a box inside one of these is a card in an overlay. */
const OVERLAY_TAG =
  /<(SheetContent|DialogContent|AlertDialogContent|AppSlideOver|AppSlideOverShell|AppBottomSheet|AppDrawer|Drawer|DrawerContent)(?![\w-])/;

/** The template lines inside an overlay primitive's element (indent-matched). */
export function overlayRegion(src: string): Set<number> {
  const lines = blankComments(templateOnly(src), "vue").split("\n");
  const region = new Set<number>();
  const indent = (s: string) => (s.match(/^\s*/)?.[0] ?? "").length;
  lines.forEach((line, i) => {
    if (!OVERLAY_TAG.test(line)) return;
    const ind = indent(line);
    let end = lines.length - 1;
    for (let k = i + 1; k < lines.length; k += 1) {
      if (!lines[k]!.trim() || indent(lines[k]!) > ind) continue;
      end = /^\s*<\//.test(lines[k]!) ? k : k - 1;
      break;
    }
    for (let k = i; k <= end; k += 1) region.add(k);
  });
  return region;
}
