#!/usr/bin/env npx tsx
/**
 * Settings-boxes audit — more than ONE card per settings tab.
 *
 * Same nesting rule as `audit-overlay-boxes.ts`: a settings tab is a single
 * glass page, so its sections are headed groups inside ONE surface rather than
 * a stack of boxes (a page of cards-in-a-card reads as a form of forms). The
 * first box in a file is free; every box after it is a finding. A RATCHET.
 *
 * Scope: the Settings form components, the `/settings` pages and the account
 * page. Overlay files are the other audit's.
 *
 * Usage:
 *   pnpm audit:settings-boxes           # report
 *   pnpm audit:settings-boxes --list
 *   pnpm audit:settings-boxes --check
 */
import { finish, readRepoFile, trackedFiles, type Finding } from "./lib/audit-kit";
import { findBoxes } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **31**. 31 boxes beyond the first in the settings files (`settings/subscription.vue` alone has most).
 *
 * 2026-11-05 (Phase 9) — **24**: settings/subscription.vue is one surface (−7).
 */
const BASELINE = 24;

const SCOPE = [
  /^app\/components\/Settings\//,
  /^app\/pages\/\[slug\]\/admin\/settings\//,
  /^app\/pages\/settings\//,
  /^app\/pages\/account\.vue$/,
];
const OVERLAY = /(Modal|Sheet|SlideOver|Dialog|Drawer|Panel)\.vue$/;

const findings: Finding[] = [];
const files = trackedFiles(["app/**/*.vue"]).filter((f) => SCOPE.some((re) => re.test(f)) && !OVERLAY.test(f));
for (const file of files) {
  const r = findBoxes(readRepoFile(file));
  for (const f of r.findings.slice(1)) findings.push({ file, line: f.line, text: `[${f.kind}]  ${f.text}`, key: f.kind });
}

finish({
  name: "settings-boxes",
  script: "audit-settings-boxes.ts",
  baseline: BASELINE,
  findings,
  note: `${files.length} settings files scanned`,
  fix: [
    "One surface per settings tab: headed groups with dividers, not a card per section.",
    "A genuine object → `ios-card--thing` or `allow-nested-box: <why>`.",
  ],
});
