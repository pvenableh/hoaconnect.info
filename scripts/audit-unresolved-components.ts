#!/usr/bin/env npx tsx
/**
 * Unresolved-components audit — a template tag that resolves to no component.
 *
 * Vue renders an unknown `<FooBar>` as a literal unknown element, so a moved or
 * renamed component leaves a silent blank hole (with only a console warning in
 * dev). The list of what Nuxt can resolve is `.nuxt/components.d.ts`, so this
 * audit reads it — which means it needs `npx nuxt prepare` to have run (CI and
 * `pnpm typecheck` both do it; the audit fails loudly, not silently, if the file
 * is missing).
 *
 * Resolution: `components.d.ts` names (incl. `Lazy` prefixes), Nuxt/Vue
 * built-ins, and anything the SFC imports or declares itself. Plain HTML/SVG
 * tags and kebab-case custom elements are skipped.
 *
 * A GATE AT 0. Tag a runtime-registered component `allow-unresolved-component: <why>`.
 *
 * Usage:
 *   pnpm audit:unresolved-components           # report
 *   pnpm audit:unresolved-components --check
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { finish, readRepoFile, ROOT, trackedFiles, type Finding } from "./lib/audit-kit";
import { findUnresolvedComponents, parseComponentNames } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **4**. 4 REAL broken tags (render as unknown elements): `<FeedFeedItem>` (ActivityFeed → `FeedItem`), `<LandingBuilderSiteSettings>` (LandingBuilderPage → `LandingBuilderSiteSettingsPanel`), `<ModerationModerationQueue>` (moderation/index → `ModerationQueue`), `<HoaInvitationAcceptForm>` (accept-invite → `InvitationAcceptForm`). Nuxt de-duplicates a folder prefix that repeats the file name. Fix = rename the four tags; then a gate at 0.
 */
const BASELINE = 4;

if (!existsSync(path.join(ROOT, ".nuxt/components.d.ts"))) {
  console.error("✗ unresolved-components audit: .nuxt/components.d.ts is missing — run `npx nuxt prepare` first.");
  process.exit(1);
}
const known = parseComponentNames(readRepoFile(".nuxt/components.d.ts"));
if (known.size < 200) {
  console.error(`✗ unresolved-components audit: components.d.ts parsed to only ${known.size} names — fix the parser.`);
  process.exit(1);
}

const findings: Finding[] = [];
let allowed = 0;
const files = trackedFiles(["app/**/*.vue", "core/app/**/*.vue"]);
for (const file of files) {
  const r = findUnresolvedComponents(readRepoFile(file), known);
  allowed += r.allowed;
  for (const h of r.hits) findings.push({ file, line: h.line, text: `<${h.key}>  —  ${h.text}`, key: h.key });
}

finish({
  name: "unresolved-components",
  script: "audit-unresolved-components.ts",
  baseline: BASELINE,
  findings,
  note: `${known.size} components known · ${files.length} files scanned${allowed ? ` · ${allowed} tagged allow-unresolved-component` : ""}`,
  fix: [
    "The tag resolves to no component. Check the file moved/renamed (Nuxt names a component from its",
    "path: App/EmptyState.vue → <AppEmptyState>), or run `npx nuxt prepare` if you just added it.",
  ],
});
