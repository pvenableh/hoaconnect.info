#!/usr/bin/env npx tsx
/**
 * Filter-pills audit — the `filter-pill` class (plan §2.3,
 * docs/spec-resource-scaffold.md).
 *
 * An index has ONE segmented status filter (`AppSegmentedControl`); any further
 * filter is a `Select`, and sibling views are a segmented control too. A
 * RATCHET, counted once per element (`--active` is the same pill).
 *
 * Usage:
 *   pnpm audit:filter-pills           # report (always exits 0)
 *   pnpm audit:filter-pills --list    # every finding
 *   pnpm audit:filter-pills --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit, isVendoredUi } from "./lib/audit-kit";
import { findFilterPills } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-14 (role-first Session 3) — measured **8** after Charges moved to
 * `AppSegmentedControl` and a type `Select` (−3 from the census).
 */
const BASELINE = 8;

runFileAudit({
  name: "filter-pills",
  script: "audit-filter-pills.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "core/app/**/*.vue"],
  scan: (src) => findFilterPills(src),
  exclude: isVendoredUi,
  fix: [
    "Use `<AppSegmentedControl>` for the one status filter or sibling views, and a `<Select>` for any other filter — plan §2.3.",
    "Tag a deliberate pill row `allow-filter-pill: <why>`.",
  ],
});
