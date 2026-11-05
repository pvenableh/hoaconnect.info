#!/usr/bin/env npx tsx
/**
 * Heading-labels audit — a `<h1-6>` dressed as a micro label (uppercase/tracked at caption size).
 *
 * Headings are the document outline; a decorative label belongs on a `<p>`/`<span>` with `type-label`. A GATE AT 0.
 *
 * Usage:
 *   pnpm audit:heading-labels           # report (always exits 0)
 *   pnpm audit:heading-labels --list    # every finding
 *   pnpm audit:heading-labels --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit, isVendoredUi } from "./lib/audit-kit";
import { findHeadingLabels } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **3**. 3: Footer.vue (h4), rules/index.vue, vendors/index.vue. Fix = `<p class="type-label">`.
 */
const BASELINE = 3;

runFileAudit({
  name: "heading-labels",
  script: "audit-heading-labels.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "core/app/**/*.vue"],
  scan: (src) => findHeadingLabels(src),
  exclude: isVendoredUi,
  fix: [
    "Make it a `<p class=\"type-micro\">` (or `type-label`) / `<span>`; keep real headings for real sections.",
    "Tag a deliberate one `allow-heading-label: <why>`.",
  ],
});
