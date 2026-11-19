#!/usr/bin/env npx tsx
/**
 * Type-scale audit — raw pixel font sizes (`text-[13px]`, `leading-[15px]`, `font-size: 13px`).
 *
 * The scale is the `type-*` classes (plus Tailwind's `text-xs…`). Pixel one-offs drift from it and don't follow Dynamic Type. A RATCHET.
 *
 * Usage:
 *   pnpm audit:type-scale           # report (always exits 0)
 *   pnpm audit:type-scale --list    # every finding
 *   pnpm audit:type-scale --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit, isVendoredUi } from "./lib/audit-kit";
import { findRawTypeSizes } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **300**. 300 `text-[Npx]` / `leading-[Npx]` / `font-size: Npx`.
 *
 * 2026-11-18 (Phase 4, Session 12) — **289**: the six-knob appearance panel and
 * ThemeSelector.vue are gone (one Appearance and Tint panel on type tokens).

 * 2026-11-18 (Phase 4, the header and dock) — **283**: the hamburger sheet,
 * the bell, the App Library and the header's chat and assistant buttons are
 * gone; the avatar's menu and the phone's dock are on type and colour tokens.
 *
 * 2026-11-18 (Phase 4, Session 16) — **282**: the floating View bar is one
 * small button on the public preview.
 */
const BASELINE = 278;

runFileAudit({
  name: "type-scale",
  script: "audit-type-scale.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "core/app/**/*.vue"],
  scan: (src) => findRawTypeSizes(src),
  exclude: isVendoredUi,
  fix: [
    "Use a `type-*` class or Tailwind scale. Tag a one-off `allow-type-px: <why>`.",
  ],
});
