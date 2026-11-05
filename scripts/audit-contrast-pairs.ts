#!/usr/bin/env npx tsx
/**
 * Contrast-pairs audit — every foreground/background token pair in
 * `theme-app.css`, graded against WCAG AA, in light AND dark.
 *
 * `tests/shared/glass-accent-tokens.test.ts` guards the accent-token
 * declaration trap; nothing graded the COLOURS. The theme file's own comments
 * record the cost of that: `--destructive` measured 1.70:1 on the dark card and
 * `--success` 4.41:1 on a white one, both found by someone squinting.
 *
 * A GATE: 4.5:1 for text pairs, 3:1 for the UI-fill pairs (a button label is
 * text, so it is held to 4.5; a status colour used only as a border/icon is 3).
 *
 * Resolution is in `scripts/lib/contrast.ts` (hex / rgb / hsl / `var()` /
 * `light-dark()`). A pair that cannot be resolved is a FINDING, not a pass —
 * otherwise a refactor to `color-mix()` would turn the gate vacuously green.
 *
 * Usage:
 *   pnpm audit:contrast-pairs           # report every pair
 *   pnpm audit:contrast-pairs --check   # gate
 */
import { blockBodies, gradePair, parseDeclarations, type Mode, type PairSpec } from "./lib/contrast";
import { finish, flags, readRepoFile, type Finding } from "./lib/audit-kit";

/**
 * 2026-11-05 — measured **1**: `--theme-button-text` (#fff) on
 * `--theme-button-hover-bg` (#008fbb) is 3.72:1 in light mode. It is the hover
 * state of the primary button, and `--theme-accent-hover` (#008fbb) is the same
 * value. Recorded, not fixed (Phase 8 records findings). Fix = darken the light
 * half of `--theme-button-hover-bg` to roughly #007aa3 or below, then set this
 * to 0 — the target is a GATE AT 0.
 *
 * 2026-11-05 (Phase 9) — **0**: light `--theme-button-hover-bg` #008fbb → #00668a (white on it 6.43:1; hover now darkens in light mode). A gate at 0 from here.
 */
const BASELINE = 0;

const THEME = "core/app/assets/css/theme-app.css";

/** Body text on the two grounds a page can sit on. */
const TEXT_ON = ["--theme-bg-primary", "--theme-card-bg", "--theme-bg-elevated"];

const PAIRS: PairSpec[] = [
  // The shadcn bridge: every `--x` against its `--x-foreground`.
  { fg: "--primary-foreground", bg: "--primary", min: 4.5 },
  { fg: "--destructive-foreground", bg: "--destructive", min: 4.5 },
  { fg: "--success-foreground", bg: "--success", min: 4.5 },
  { fg: "--warning-foreground", bg: "--warning", min: 4.5 },
  { fg: "--info-foreground", bg: "--info", min: 4.5 },
  { fg: "--theme-button-text", bg: "--theme-button-bg", min: 4.5 },
  { fg: "--theme-button-text", bg: "--theme-button-hover-bg", min: 4.5 },
  // Text ramp — `t-text-*` — on every ground.
  ...TEXT_ON.flatMap((bg) =>
    ["--theme-text-primary", "--theme-text-secondary", "--theme-text-tertiary", "--theme-text-muted"].map(
      (fg): PairSpec => ({ fg, bg, min: 4.5 }),
    ),
  ),
  // Links and accent text.
  ...TEXT_ON.flatMap((bg) =>
    ["--theme-link-color", "--theme-accent-primary"].map((fg): PairSpec => ({ fg, bg, min: 4.5 })),
  ),
  // Status colours are used as TEXT far more than as fills (`text-destructive`).
  ...TEXT_ON.flatMap((bg) =>
    ["--destructive", "--success", "--warning", "--info"].map((fg): PairSpec => ({ fg, bg, min: 4.5 })),
  ),
];

const css = readRepoFile(THEME);
const bodies = blockBodies(css, "html.theme-app");
if (bodies.length === 0) {
  console.error(`✗ contrast-pairs audit: no \`html.theme-app { … }\` block found in ${THEME}.`);
  process.exit(1);
}
const decls = new Map<string, string>();
for (const b of bodies) for (const [k, v] of parseDeclarations(b)) decls.set(k, v);

const findings: Finding[] = [];
const all: string[] = [];
for (const mode of ["light", "dark"] as Mode[]) {
  for (const spec of PAIRS) {
    const r = gradePair(spec, decls, mode);
    const line = r.ratio != null ? `${r.ratio.toFixed(2)}:1` : (r.reason ?? "unresolved");
    all.push(`${r.ok ? "ok  " : "FAIL"} ${mode.padEnd(5)} ${spec.fg} on ${spec.bg}  ${line} (min ${spec.min})`);
    if (!r.ok) {
      findings.push({ file: THEME, line: 0, text: `${mode}: ${spec.fg} on ${spec.bg} — ${line} (needs ${spec.min})` });
    }
  }
}

if (flags.list) for (const l of all) console.log(`  ${l}`);

finish({
  name: "contrast-pairs",
  script: "audit-contrast-pairs.ts",
  baseline: BASELINE,
  findings,
  note: `${PAIRS.length * 2} pair×mode combinations graded.`,
  fix: [
    "A token pair dropped under WCAG AA. Move the token in theme-app.css (both the",
    "`light-dark()` pair and the `@supports` fallback block further down), not the pair list.",
  ],
});
