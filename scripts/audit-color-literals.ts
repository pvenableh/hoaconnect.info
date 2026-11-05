#!/usr/bin/env npx tsx
/**
 * Color-literals audit — Tailwind PALETTE classes (`text-gray-500`, `bg-emerald-600`, `bg-white`).
 *
 * A palette class welds a colour into the markup, so it ignores dark mode, the org accent and the contrast-pairs audit. The semantic tokens
 * (`t-text-*`, `t-bg-*`, `text-destructive`, `bg-success/15`) are what replace them. A RATCHET: the count only goes down.
 *
 * Out of scope on purpose: the vendored `ui/` primitives, and PUBLIC surfaces (marketing + the org landing themes), which carry their own palette.
 *
 * Usage:
 *   pnpm audit:color-literals           # report (always exits 0)
 *   pnpm audit:color-literals --list    # every finding
 *   pnpm audit:color-literals --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit, isVendoredUi } from "./lib/audit-kit";
import { findColorLiterals } from "./lib/audit-matchers";

/**
 * Public surfaces keep their own palette: marketing pages, the org landing themes and the landing builder preview.
 */
const PUBLIC_SURFACE =
  /^app\/components\/(Marketing|Org\/Landing|LandingBuilder)\/|^app\/pages\/(index|pricing|features|property-managers|blog|legal)/;

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **639**. 639 palette/white/black classes across the in-scope tree (public surfaces and ui/ excluded). Drain by family: red→`text-destructive`, green/emerald→`text-success`, amber→`text-warning`, blue/sky→`text-info`, grey→`t-text-*`.
 *
 * 2026-11-05 (Phase 9) — **609**: the subscription page rewritten on tokens (−30).
 */
const BASELINE = 609;

runFileAudit({
  name: "color-literals",
  script: "audit-color-literals.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "app/**/*.ts", "core/app/**/*.vue", "core/app/**/*.ts"],
  scan: (src, file) => findColorLiterals(src, file.endsWith(".vue") ? "vue" : "ts"),
  exclude: (f) => isVendoredUi(f) || PUBLIC_SURFACE.test(f),
  fix: [
    "Use a theme token: `t-text-primary|secondary|muted`, `t-bg-subtle`, `text-destructive`, `bg-success/15`,",
    "or tag a colour that IS the content `allow-color-literal: <why>`.",
  ],
});
