#!/usr/bin/env npx tsx
/**
 * Page-h1 audit — a raw `<h1>` in a page (plan §2.3, docs/spec-resource-scaffold.md).
 *
 * A page's title is `AppPageHeader`: in the workspace it registers with the
 * shell header, so every title has one size and one place. A RATCHET. Pages are
 * the route files and the page bodies they mount (`app/components/pages/`).
 *
 * Usage:
 *   pnpm audit:page-h1           # report (always exits 0)
 *   pnpm audit:page-h1 --list    # every finding
 *   pnpm audit:page-h1 --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit } from "./lib/audit-kit";
import { findPageH1s } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-14 (role-first Session 3) — measured **42** after Charges moved to
 * `AppPageHeader` (−1 from the census).
 */
const BASELINE = 42;

runFileAudit({
  name: "page-h1",
  script: "audit-page-h1.ts",
  baseline: BASELINE,
  globs: ["app/pages/**/*.vue", "app/components/pages/**/*.vue"],
  scan: (src) => findPageH1s(src),
  fix: [
    "Use `<AppPageHeader title=…>` (actions in `#actions`, a badge in `#meta`) — plan §2.3.",
    "Tag a deliberate inline title `allow-page-h1: <why>` (a public page with no shell).",
  ],
});
