#!/usr/bin/env npx tsx
/**
 * Empty-states audit — bare "No X yet" copy outside `App/EmptyState`.
 *
 * EmptyState carries the icon, the reason and the call to action; a naked paragraph is a dead end. "No results / matches" are search outcomes,
 * not empty collections, and are skipped. A RATCHET.
 *
 * Usage:
 *   pnpm audit:empty-states           # report (always exits 0)
 *   pnpm audit:empty-states --list    # every finding
 *   pnpm audit:empty-states --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit, isVendoredUi } from "./lib/audit-kit";
import { findBareEmptyStates } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **55**. 55 bare "No X yet" lines outside `AppEmptyState`.
 */
const BASELINE = 55;

runFileAudit({
  name: "empty-states",
  script: "audit-empty-states.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "core/app/**/*.vue"],
  scan: (src) => findBareEmptyStates(src),
  exclude: isVendoredUi,
  fix: [
    "Use `<AppEmptyState title=… description=…>` (with an action where there is one).",
    "Tag a deliberate inline note `allow-bare-empty: <why>`.",
  ],
});
