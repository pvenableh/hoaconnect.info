#!/usr/bin/env npx tsx
/**
 * Hydration-pending audit — a `server: false` useAsyncData/useFetch whose
 * template branches on `pending` without counting "idle" as loading.
 *
 * The server renders "idle" (not loading), the client's first render "pending"
 * (loading): hydration mismatches and the data lands in a detached node, so the
 * page stays blank. See `findHydrationPending` in scripts/lib/audit-matchers.ts.
 *
 * Usage:
 *   pnpm audit:hydration-pending           # report (always exits 0)
 *   pnpm audit:hydration-pending --list    # every finding
 *   pnpm audit:hydration-pending --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit } from "./lib/audit-kit";
import { findHydrationPending } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-26 — a gate at **0** from the start: the sweep fixed every page it found.
 */
const BASELINE = 0;

runFileAudit({
  name: "hydration-pending",
  script: "audit-hydration-pending.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue"],
  exclude: (f) => f.startsWith("app/components/ui/"),
  scan: (src) => findHydrationPending(src),
  fix: [
    'Take `status` and derive `const pending = computed(() => status.value === "idle" || status.value === "pending")`.',
    "Or wrap the block in <ClientOnly> with the same loading fallback.",
    "Tag a deliberate one `allow-hydration-pending: <why>`.",
  ],
});
