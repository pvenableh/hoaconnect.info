#!/usr/bin/env npx tsx
/**
 * Overlay-boxes audit — a card INSIDE an overlay (sheet, modal, slide-over).
 *
 * The glass nesting rule (two glass layers stack into mud): an overlay already
 * IS the elevated surface, so a body made of `ios-card` / `<Card>` / tinted
 * bordered boxes puts glass on glass. Group fields with spacing, dividers and
 * `t-text-*` hierarchy, not another box.
 *
 * Scope: every file whose name says it is an overlay (`…Modal|Sheet|SlideOver|
 * Dialog|Drawer|Panel.vue`, vendored `ui/` excluded) is read WHOLE; any other
 * file is read only inside an overlay primitive's element (`<AppBottomSheet>`,
 * `<AppSlideOverShell>`, `<DialogContent>` …). A RATCHET.
 *
 * Tag a box that is genuinely content (a preview card, a receipt) `allow-nested-box: <why>`;
 * an `ios-card--thing` modifier is the sanctioned "this is an object" card.
 *
 * Usage:
 *   pnpm audit:overlay-boxes           # report
 *   pnpm audit:overlay-boxes --list
 *   pnpm audit:overlay-boxes --check
 */
import { finish, isVendoredUi, readRepoFile, trackedFiles, type Finding } from "./lib/audit-kit";
import { findBoxes, overlayRegion } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **27**. 27 boxes inside overlays (StorageManagerPage, UsersPage … the biggest).
 */
const BASELINE = 27;

const OVERLAY_NAME = /(Modal|Sheet|SlideOver|Dialog|Drawer|Panel)\.vue$/;

const findings: Finding[] = [];
let things = 0;
const files = trackedFiles(["app/**/*.vue", "core/app/**/*.vue"]).filter((f) => !isVendoredUi(f));
for (const file of files) {
  const src = readRepoFile(file);
  const whole = OVERLAY_NAME.test(file);
  const region = whole ? undefined : overlayRegion(src);
  if (!whole && region!.size === 0) continue;
  const r = findBoxes(src, region);
  things += r.things;
  for (const f of r.findings) findings.push({ file, line: f.line, text: `[${f.kind}]  ${f.text}`, key: f.kind });
}

finish({
  name: "overlay-boxes",
  script: "audit-overlay-boxes.ts",
  baseline: BASELINE,
  findings,
  note: `${files.length} files scanned${things ? ` · ${things} sanctioned (allow-nested-box / ios-card--thing)` : ""}`,
  fix: [
    "An overlay is already a card. Drop the inner `ios-card` / `<Card>` / bordered box and group with",
    "spacing + dividers. A genuine object → `ios-card--thing` or `allow-nested-box: <why>`.",
  ],
});
