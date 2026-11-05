#!/usr/bin/env npx tsx
/**
 * Raw-buttons audit — a bare `<button>` outside the shared button tiers.
 *
 * The tiers carry the focus ring, press state, haptic and disabled treatment. A RATCHET. The vendored `ui/button` and the shared action-button
 * primitives are exempt by path.
 *
 * Usage:
 *   pnpm audit:raw-buttons           # report (always exits 0)
 *   pnpm audit:raw-buttons --list    # every finding
 *   pnpm audit:raw-buttons --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit, isVendoredUi, trackedFiles } from "./lib/audit-kit";
import { findRawButtons } from "./lib/audit-matchers";

/**
 * The shell primitives. These ARE the controls everything else is told to use
 * (the dock icons, the segmented control, the sheet grabber…), so a raw
 * `<button>` inside them is the implementation, not a bypass. Asserted to exist
 * so a rename can't silently turn the exemption into a no-op.
 */
const PRIMITIVES = [
  "app/components/App/Dock.vue",
  "app/components/App/Nav.vue",
  "app/components/App/AppLibrary.vue",
  "app/components/App/SegmentedControl.vue",
  "app/components/App/BottomSheet.vue",
  "app/components/App/SlideOverShell.vue",
  "app/components/App/DataTable.vue",
];
{
  const tracked = new Set(trackedFiles(["app/components/App/*.vue"]));
  const missing = PRIMITIVES.filter((p) => !tracked.has(p));
  if (missing.length) {
    console.error(`✗ raw-buttons audit: exempted primitive(s) no longer exist: ${missing.join(", ")}`);
    process.exit(1);
  }
}

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **318**. 318 outside `ui/button` and the 7 shell primitives.
 *
 * 2026-11-05 (Phase 9) — **313**: the subscription page's buttons are `<Button>` / `AppSegmentedControl` (−5).
 */
const BASELINE = 313;

runFileAudit({
  name: "raw-buttons",
  script: "audit-raw-buttons.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "core/app/**/*.vue"],
  scan: (src) => findRawButtons(src),
  exclude: (f) => isVendoredUi(f) || PRIMITIVES.includes(f),
  fix: [
    "Use `<Button>` (primary / outline / ghost) `<ActionButton>` (inline T3/T4) — docs/button-type-case-system.md.",
    "Tag a deliberate raw button `allow-raw-button: <why>` (a calendar cell, a drag handle).",
  ],
});
