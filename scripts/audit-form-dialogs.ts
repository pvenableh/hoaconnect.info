#!/usr/bin/env npx tsx
/**
 * Form-dialogs audit — a raw `<Dialog>` holding a form (plan §2.3,
 * docs/spec-resource-scaffold.md).
 *
 * A record's form is one component in `AppBottomSheet` — a sheet on phones, a
 * centred dialog on desktop — and edit opens the same form filled in. A RATCHET.
 * The vendored `ui/` parts are exempt by path.
 *
 * Usage:
 *   pnpm audit:form-dialogs           # report (always exits 0)
 *   pnpm audit:form-dialogs --list    # every finding
 *   pnpm audit:form-dialogs --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit, isVendoredUi } from "./lib/audit-kit";
import { findFormDialogs } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-14 (role-first Session 3) — measured **27**.
 */
const BASELINE = 27;

runFileAudit({
  name: "form-dialogs",
  script: "audit-form-dialogs.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "core/app/**/*.vue"],
  scan: (src) => findFormDialogs(src),
  exclude: isVendoredUi,
  fix: [
    "Move the form into its own component and open it in `<AppBottomSheet>` — plan §2.3.",
    "Tag a dialog that is not a record form `allow-form-dialog: <why>` (a wizard, a picker).",
  ],
});
