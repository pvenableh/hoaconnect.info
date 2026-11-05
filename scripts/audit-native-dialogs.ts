#!/usr/bin/env npx tsx
/**
 * Native-dialogs audit — the browser's own `confirm()` / `alert()` / `prompt()`.
 *
 * They block the main thread, can't be styled, don't honour dark mode or the glass shell, are suppressed in installed PWAs / iOS standalone windows in some
 * configurations, and can't be driven by tests. Phase 1 replaced every one with `useConfirm()` (and toasts for alerts); this keeps it that way.
 *
 * A GATE AT 0. A genuine exception is tagged `allow-native-dialog` with the reason.
 *
 * Usage:
 *   pnpm audit:native-dialogs           # report (always exits 0)
 *   pnpm audit:native-dialogs --list    # every finding
 *   pnpm audit:native-dialogs --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit } from "./lib/audit-kit";
import { findNativeDialogs } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **4**. 4 `prompt()` calls (ChannelMessage report reason, ProjectGantt ×2, approvals reject note). `confirm`/`alert` are already 0 — Phase 1 held. The plan expected a gate at 0; it is not, so this ratchets until the 4 `prompt()`s become `useConfirm` + a text field.
 */
const BASELINE = 4;

runFileAudit({
  name: "native-dialogs",
  script: "audit-native-dialogs.ts",
  baseline: BASELINE,
  globs: ["app/**/*.vue", "app/**/*.ts", "core/app/**/*.ts", "core/app/**/*.vue", "core/shared/**/*.ts"],
  scan: (src, file) => findNativeDialogs(src, file.endsWith(".vue") ? "vue" : "ts"),
  
  fix: [
    "Use `const { confirm } = useConfirm()` (an options OBJECT — that is what separates it",
    "from the native call) or a toast. Tag a real exception `allow-native-dialog: <why>`.",
  ],
});
