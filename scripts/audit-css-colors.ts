#!/usr/bin/env npx tsx
/**
 * CSS-colors audit — `#hex` / `rgb()` / `hsl()` / `oklch()` written directly in a
 * rule, in a stylesheet or a `<style>` block, instead of a token.
 *
 * A literal in a rule can't follow dark mode, the org accent or the contrast
 * audit. Token DEFINITIONS (`--theme-bg-primary: light-dark(#f6f8fb, #0b1015)`)
 * are where literals belong and are exempt — the rule is about USING one.
 * A RATCHET. Colour that IS the content (a brand preview, a printed design, a
 * fixed-colour mock of someone else's UI) is tagged `allow-css-color: <why>`.
 *
 * Usage:
 *   pnpm audit:css-colors           # report (always exits 0)
 *   pnpm audit:css-colors --top     # the worst files
 *   pnpm audit:css-colors --check   # the gate — exits 1 above the baseline
 */
import { finish, readRepoFile, trackedFiles, type Finding } from "./lib/audit-kit";
import { findCssColors, styleBlocks } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **222**. 222 literals in rules (token definitions excluded): earnest-ui.css, landing.css and tailwind.css carry most; `approve/[token].vue` and `experimental.vue` are self-contained pages.
 */
const BASELINE = 222;

const findings: Finding[] = [];
let allowed = 0;

const cssFiles = trackedFiles(["app/**/*.css", "core/app/**/*.css"]);
for (const file of cssFiles) {
  const r = findCssColors(readRepoFile(file));
  allowed += r.allowed;
  for (const h of r.hits) findings.push({ file, line: h.line, text: h.text });
}

const vueFiles = trackedFiles(["app/**/*.vue", "core/app/**/*.vue"]);
for (const file of vueFiles) {
  const src = readRepoFile(file);
  if (!src.includes("<style")) continue;
  const raw = src.split("\n");
  for (const b of styleBlocks(src)) {
    const r = findCssColors(b.body, b.startLine);
    allowed += r.allowed;
    for (const h of r.hits) findings.push({ file, line: h.line, text: (raw[h.line - 1] ?? "").trim().slice(0, 110) });
  }
}

finish({
  name: "css-colors",
  script: "audit-css-colors.ts",
  baseline: BASELINE,
  findings,
  note: `${cssFiles.length} stylesheets + ${vueFiles.length} SFCs scanned${allowed ? ` · ${allowed} tagged allow-css-color` : ""}`,
  fix: [
    "Use a token: `var(--theme-text-primary)`, `var(--theme-border-primary)`, `var(--primary)` …",
    "Colour that IS the content → tag it `allow-css-color: <why>`.",
  ],
});
