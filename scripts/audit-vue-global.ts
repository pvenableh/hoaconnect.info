#!/usr/bin/env npx tsx
/**
 * Vue-global audit — `:global(X) .child` inside `<style scoped>`.
 *
 * Vue's compiler keeps only what is INSIDE `:global(…)` and drops the rest, so the rule silently matches `.dark` everywhere. Write
 * `:global(.dark .child)`. A GATE AT 0.
 *
 * Usage:
 *   pnpm audit:vue-global           # report (always exits 0)
 *   pnpm audit:vue-global --list    # every finding
 *   pnpm audit:vue-global --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit } from "./lib/audit-kit";
import { findBrokenGlobals } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **0**. 0 from day one — a gate.
 */
const BASELINE = 0;

runFileAudit({
  name: "vue-global",
  script: "audit-vue-global.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "core/app/**/*.vue"],
  scan: (src) => findBrokenGlobals(src),
  
  fix: [
    "Wrap the WHOLE selector: `:global(.dark) .foo` → `:global(.dark .foo)`.",
  ],
});
