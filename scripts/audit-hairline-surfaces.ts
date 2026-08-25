#!/usr/bin/env npx tsx
/**
 * Hairline-surface audit — hand-rolled card surfaces the glass sweep missed.
 *
 * The liquid-glass edge system replaced the 1px card border with a refracted
 * rim, and earnest-ui.css records the change on the shared class:
 *
 *     .ios-card { … border: 0; box-shadow: var(--glass-edge-shadow); }
 *
 * ⚠️ But that work happened INSIDE `.ios-card`. Any component painting its own
 * box — `rounded-xl border t-border t-bg-subtle` — kept the pre-glass flat look
 * and nothing flagged it, because a class list is not a class.
 *
 * Ported from Earnest (scripts/audit-hairline-surfaces.ts), where the same sweep
 * ran to zero. ADAPTED IN ONE IMPORTANT WAY: Earnest's card idiom is shadcn's
 * `border border-border`, which appears in exactly one file here. HOA Connect
 * paints its hairlines with the THEME classes — `border t-border` — 361 times
 * across 102 files. Porting the regex verbatim would have measured almost
 * nothing and reported a clean repo. See FULL_BORDER below.
 *
 * WHAT COUNTS
 * -----------
 * A container that paints a CARD SURFACE by hand: a full `border` (the bare
 * utility — not `border-b`, which is a divider) plus a theme border colour, plus
 * a `bg-*`, plus a boxy radius (`rounded-md` and up).
 *
 * WHAT DOES NOT — and these exemptions are the whole reason this is a script and
 * not a find-and-replace. A naive sweep gets roughly one in three wrong:
 *
 *   • **Dividers.** `border-b t-border` under a nav bar is a rule, not a box.
 *     Excluded structurally: FULL_BORDER requires the bare `border` utility.
 *   • **Functional borders.** `focus-within:border-primary/50`,
 *     `hover:border-primary/40` — the border IS the state indicator. Deleting it
 *     removes the affordance, not decoration.
 *   • **Pills and controls.** `rounded-full`, and `<input>` / `<textarea>` /
 *     `<select>` / `<button>` tags, which have their own material.
 *   • **Popovers and menus.** `bg-popover`, and heavy shadows — floating layers
 *     carry a deliberate shadow and are not page surfaces.
 *   • **Small chips.** An `h-6` badge or a `p-1` icon button is not a card; a 1px
 *     rim at that size is the shape, not a missed sweep.
 *
 * Anything genuinely needing its own hairline can be tagged
 * `allow-hairline-surface` in a comment within 6 lines above.
 *
 * A GATE AT ZERO, as of Phase 8. It landed as a ratchet at 26 — the census the
 * day it was written — because a gate at 0 on day one, with the sweep not yet
 * done, would simply have been switched off. The sweep is done: 26 findings
 * converted, tagged or correctly excluded, and BASELINE is 0. From here the
 * `.husky/pre-commit` hook refuses any commit that adds a hand-rolled card
 * surface, which is the only thing that keeps the remaining `t-border` pile
 * from growing back.
 *
 * Usage:
 *   pnpm audit:hairline-surfaces           # report
 *   pnpm audit:hairline-surfaces --list    # every finding
 *   pnpm audit:hairline-surfaces --json
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * NEVER raise this. It is 0, and a finding is now a failed commit rather than a
 * number to nudge — the escape hatch below (`allow-hairline-surface`, with a
 * reason) exists precisely so that raising it is never the answer.
 *
 * 2026-08-24 — landed at **26**, the census that day.
 * 2026-08-25 — **0**, after Phase 8. Where the 26 went: 12 converted to
 * `ios-card`, 3 status banners recoloured onto their own semantic border (which
 * takes them out of scope, since the rule wants a THEME border colour), 5
 * tagged `allow-hairline-surface` (3 photo wells, 2 tippy mention popups), and
 * 6 that were never findings — 5 marketing app-window mocks and one shadcn
 * dialog — released by fixing FLOATING, which had been ported knowing Earnest's
 * shadow spelling and not this app's.
 *
 * The numbers are still the argument for why this is a script and not a
 * find-and-replace: 361 raw `t-border` hits across 102 files, of which 26 were
 * genuine hand-rolled card surfaces. Everything else is a DIVIDER (`border-b
 * t-border`), a control, a floating layer or a chip — and the pile of dividers
 * is exactly what a find-and-replace would have wrecked.
 */
const BASELINE = 0;

/** The shared surfaces. Their own definitions are what a sweep would fix. */
const PRIMITIVES = ["core/app/assets/css/", "app/assets/css/"];

/**
 * A boxy radius. ⚠️ The arbitrary form is restricted to px/rem: `rounded-[50%]`
 * is an ELLIPSE, not a card.
 */
const BOXY_RADIUS = /rounded-(sm|md|lg|xl|2xl|3xl|\[[\d.]+(px|rem)\])/;

/**
 * A FULL border — all four sides — carrying a theme border colour.
 *
 * Split into two tests rather than one regex because the two halves can appear
 * in either order (`border t-border` and `t-border border` both occur), and
 * because the bare-utility check needs lookarounds on BOTH sides. A trailing
 * `\b` alone is not enough: `\bborder\b` matches the tail of `t-border` itself,
 * which made the whole test vacuous — every `t-border` satisfied it, dashed
 * drop-zones and `border-2` boxes included. The leading `(?<![-\w])` is what
 * makes "a bare `border` utility" actually mean that.
 */
const BARE_BORDER = /(?<![-\w])border(?![-\w/])/;
const THEME_BORDER_COLOR =
  /\bt-border(-(secondary|light|divider|accent))?(?![-\w])|\bborder-border(\/\d+)?\b/;
const FULL_BORDER = (line: string) => BARE_BORDER.test(line) && THEME_BORDER_COLOR.test(line);

const HAS_BG = /\bbg-[a-z]/;

/** The border is a state indicator, not decoration — leave it alone. */
const FUNCTIONAL_BORDER = /(hover|focus|focus-within|active|group-hover|data-\[[^\]]+\]):border-/;

/**
 * Floating layers — popovers, dropdown panels, modal cards.
 *
 * ⚠️ A heavy shadow is a HARD disqualifier, not a hint, because of the cascade:
 * `.glass-edge` / `.ios-card` live in `@layer components` and a `shadow-*`
 * Tailwind utility sits in the utilities layer, so the UTILITY WINS. Converting
 * one of these leaves the surface with no border and no rim — strictly worse
 * than the hairline it replaced. Earnest's first sweep did exactly that to 13
 * surfaces before the conflict was caught.
 *
 * TWO GAPS CLOSED IN PHASE 8, both the same porting bug as the `border` /
 * `t-border` one in FULL_BORDER — the ported regex knew Earnest's spelling and
 * not this app's:
 *
 *   • `t-shadow-*`, this app's own shadow classes (theme.css:812-814). They are
 *     UNLAYERED — verified by brace-matching, not assumed — so they beat `@layer
 *     components` outright, which makes ANY weight of them a hard disqualifier
 *     rather than only the heavy ones. Five marketing mocks (app-window frames
 *     on the property-managers page) sat in the census wearing `t-shadow-lg` and
 *     reading as hand-rolled cards.
 *   • A stacked layer that is `relative`, not `absolute`. `DialogScrollContent`
 *     is `relative z-50 … shadow-lg` inside a fixed overlay: floating by any
 *     reading, invisible to a rule that only looks for `absolute|fixed|sticky`.
 *     A z-index utility next to a `shadow-lg` is the signal — page surfaces do
 *     not carry one.
 */
const SHADOW_HEAVY = /\bshadow-(xl|2xl)\b|\bt-shadow-(sm|md|lg|xl|2xl)\b/;
const SHADOW_LG = /\bshadow-lg\b/;
const STACKED = /\b(absolute|fixed|sticky)\b|\bz-\d+\b/;
const FLOATING = (line: string) =>
  /\bbg-popover\b/.test(line) ||
  SHADOW_HEAVY.test(line) ||
  (SHADOW_LG.test(line) && STACKED.test(line));

/**
 * A form field's class list, not a card's.
 *
 * ⚠️ TAG_CONTROL only sees a tag near the same line, so it misses the shape
 * these take inside a `<style>` block, where the selector is the only clue.
 * Fields wear `.glass-field`, not the card rim.
 */
const FORM_FIELD = /\b(resize-none|placeholder:|focus:ring-|caret-)/;

/**
 * A mock of SOMEONE ELSE'S interface — an email client's chrome, a phone-frame
 * preview. `bg-white` / `bg-black` with literal grey text is the tell. These
 * deliberately do NOT wear this app's material; looking like the destination is
 * the entire point.
 */
const FOREIGN_CHROME = /\bbg-(white|black)\b|\btext-gray-\d/;

/** Badge/chip/icon-button sizing — a rim at this scale is the shape. */
const CHIP_SIZED = /\b(h-[3-7]|p-1|p-1\.5|px-1|px-1\.5|px-2)\b/;

const TAG_CONTROL = /<(input|textarea|select|button)\b/;

/**
 * The element this class list belongs to, found by walking BACK to the nearest
 * opening tag.
 *
 * ⚠️ Checking only the current line is not enough: a formatter reflows a long
 * tag so each attribute gets its own line, which moves `<input` / `<button` away
 * from the `class="…"` that follows. A rule that changes its answer when the
 * formatter runs is not measuring the code.
 */
function ownerIsControl(raw: string[], i: number): boolean {
  for (let back = 0; back <= 10; back += 1) {
    const line = raw[i - back];
    if (line === undefined) return false;
    if (TAG_CONTROL.test(line)) return true;
    // Any other opening tag owns this attribute instead — stop looking.
    if (/<[a-zA-Z][a-zA-Z0-9-]*/.test(line)) return false;
  }
  return false;
}

/** Same spelling as an escape hatch anywhere else in the repo. */
const ALLOW_MARKER = /(\/\/|<!--|\/\*).*?allow-hairline-surface/;

/**
 * Blank out comment bodies before matching — otherwise the prose *about* the
 * problem (this file's own porting notes included) lands in the count.
 * Characters become spaces rather than vanishing, so line/column stay exact.
 */
function blankComments(src: string): string {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== "\n") out[i] = " ";
    }
  };

  const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
  for (const m of src.matchAll(HTML_COMMENT)) blank(m.index!, m.index! + m[0].length);

  let offset = 0;
  for (const line of src.split("\n")) {
    if (/^\s*\*/.test(line)) blank(offset, offset + line.length);
    offset += line.length + 1;
  }

  return out.join("");
}

/**
 * ⚠️ GUARD: a `glass-*` class inside an `@apply`.
 *
 * These are plain CSS in earnest-ui.css / theme-app.css, NOT Tailwind utilities.
 * The dev server tolerates `@apply glass-edge`; the PRODUCTION build fails with
 * `Cannot apply unknown utility class`. So this is a build break that only ever
 * shows up on deploy.
 *
 * The obvious guard — `grep '@apply[^;{]*glass-'` — is single-line blind, and a
 * multi-line `@apply` whose `glass-` sits on a continuation line sails past it.
 * This parses the whole statement, `@apply` through its terminating `;`, across
 * newlines. This half is a GATE from day one (it has no baseline): unlike the
 * hairline census, there is no legacy pile of these to drain, and every one of
 * them is a broken production build.
 */
function findApplyGlass(src: string, file: string): string[] {
  const hits: string[] = [];
  for (const block of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    // ⚠️ Blank CSS block comments FIRST, preserving newlines so the reported
    // line number stays right. Without this the guard flags the very warning
    // comments that explain the hazard ("NOT `@apply glass-edge`"), because the
    // comment's opening `/*` sits before the `@apply` the regex matches and so
    // never appears inside the matched statement.
    // ⚠️ Locate the block from the RAW capture, before blanking. Earnest's copy
    // computed the offset with `indexOf(body)` on the already-blanked text,
    // which never matches the source once a comment has been spaced out —
    // `indexOf` returned -1 and every reported line came out one short.
    const rawBody = block[1] ?? "";
    const base = src.slice(0, block.index! + block[0].indexOf(rawBody)).split("\n").length;
    const body = rawBody.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    for (const stmt of body.matchAll(/@apply\b[^;]*;/g)) {
      const text = stmt[0];
      if (!/\bglass-[a-z-]+/.test(text)) continue;
      const line = base + body.slice(0, stmt.index!).split("\n").length - 1;
      hits.push(`${file}:${line}  ${text.replace(/\s+/g, " ").slice(0, 100)}`);
    }
  }
  return hits;
}

interface Finding {
  file: string;
  line: number;
  text: string;
}

const args = process.argv.slice(2);
const wantList = args.includes("--list");
const wantJson = args.includes("--json");

// Both the app and the core layer: a component that moved down into `core`
// carries its hairlines with it, and would otherwise leave the census.
const files = execSync('git ls-files "app/**/*.vue" "core/**/*.vue"', {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .filter((f) => !PRIMITIVES.some((p) => f.toLowerCase().startsWith(p.toLowerCase())));

const findings: Finding[] = [];
let allowed = 0;
const skipped = { functional: 0, floating: 0, chip: 0, control: 0, ellipse: 0, field: 0, foreign: 0 };

const applyGlass: string[] = [];

for (const file of files) {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  applyGlass.push(...findApplyGlass(src, file));

  const raw = src.split("\n");
  const lines = blankComments(raw.join("\n")).split("\n");

  lines.forEach((line, i) => {
    if (!FULL_BORDER(line)) return;
    if (!HAS_BG.test(line)) return;
    if (!BOXY_RADIUS.test(line)) {
      if (/rounded-\[\d+%\]/.test(line)) skipped.ellipse += 1;
      return;
    }

    if (ownerIsControl(raw, i)) return void (skipped.control += 1);
    if (FUNCTIONAL_BORDER.test(line)) return void (skipped.functional += 1);
    if (FLOATING(line)) return void (skipped.floating += 1);
    if (FORM_FIELD.test(line)) return void (skipped.field += 1);
    if (FOREIGN_CHROME.test(line)) return void (skipped.foreign += 1);
    if (CHIP_SIZED.test(line)) return void (skipped.chip += 1);

    /**
     * Look back far enough for a real justification. Two lines (the convention
     * for a template tag) is not enough here: inside a `<style>` block the
     * marker goes above the SELECTOR, which puts it several lines above the
     * `@apply` the rule actually matched.
     */
    const LOOKBACK = 6;
    let tagged = false;
    for (let back = 0; back <= LOOKBACK && !tagged; back += 1) {
      if (ALLOW_MARKER.test(raw[i - back] ?? "")) tagged = true;
    }
    if (tagged) {
      allowed += 1;
      return;
    }

    findings.push({ file, line: i + 1, text: (raw[i] ?? "").trim().slice(0, 110) });
  });
}

if (wantJson) {
  console.log(
    JSON.stringify({ baseline: BASELINE, count: findings.length, allowed, skipped, findings }, null, 2),
  );
  process.exitCode = findings.length > BASELINE || applyGlass.length > 0 ? 1 : 0;
  process.exit();
}

if (wantList) {
  for (const f of findings) console.log(`  ${f.file}:${f.line}  ${f.text}`);
  console.log("");
}

if (applyGlass.length) {
  console.error(`\n✗ hairline-surface audit: ${applyGlass.length} \`glass-*\` class inside an @apply.`);
  console.error("  These are plain CSS in earnest-ui.css, not Tailwind utilities. The dev server");
  console.error('  tolerates this; `pnpm build` fails with "Cannot apply unknown utility class".');
  console.error("  Put the class on the element, or inline the declarations:");
  console.error("    border: 0; box-shadow: var(--glass-edge-shadow);");
  for (const h of applyGlass) console.error(`    ${h}`);
  console.error("");
  process.exitCode = 1;
}

const n = findings.length;

if (n > BASELINE) {
  console.error(
    `\n✗ hairline-surface audit: ${n} hand-rolled card surfaces (baseline ${BASELINE}) — ${n - BASELINE} added.`,
  );
  console.error("  Use `ios-card` (or `glass-edge` on a surface that keeps its own quieter background).");
  console.error("  It carries the refracted rim; a 1px `border t-border` line is the pre-glass idiom.");
  console.error("  If this box genuinely needs its own hairline, tag it `allow-hairline-surface`.");
  console.error("  Run with --list to see every finding.\n");
  process.exitCode = 1;
}

const suffix = n < BASELINE ? `\n  Nice — lower BASELINE in scripts/audit-hairline-surfaces.ts to ${n}.` : "";
if (n <= BASELINE)
  console.log(
    `\n✓ hairline-surface audit: ${n} remaining (baseline ${BASELINE}) — no regression.` +
      `\n  ${allowed} tagged allow-hairline-surface.` +
      `\n  Skipped as not-a-surface: ${skipped.control} control · ` +
      `${skipped.functional} functional border · ${skipped.floating} floating · ${skipped.chip} chip · ` +
      `${skipped.ellipse} ellipse · ${skipped.field} form field · ${skipped.foreign} foreign chrome.${suffix}`,
  );
