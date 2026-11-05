#!/usr/bin/env npx tsx
/**
 * Raw-date-inputs audit — `<input type="date|datetime-local|month|week">`.
 *
 * The native pickers render per-browser, ignore the org time zone and the glass shell, and Safari's is a different control from Chrome's. Phase 1
 * introduced `DateInput` / the shared picker. A GATE AT 0 (the picker primitive itself is exempt by path).
 *
 * Usage:
 *   pnpm audit:raw-date-inputs           # report (always exits 0)
 *   pnpm audit:raw-date-inputs --list    # every finding
 *   pnpm audit:raw-date-inputs --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit } from "./lib/audit-kit";
import { findRawDateInputs } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **0**. 0 from day one — a gate. (`type="time"` appears once in MeetingsAdminPage and is deliberately out of scope: there is no shared time picker.)
 */
const BASELINE = 0;

runFileAudit({
  name: "raw-date-inputs",
  script: "audit-raw-date-inputs.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "core/app/**/*.vue"],
  scan: (src) => findRawDateInputs(src),
  
  fix: [
    "Use the shared `DateInput` / date-time picker. Tag a real exception `allow-raw-date-input: <why>`.",
  ],
});
