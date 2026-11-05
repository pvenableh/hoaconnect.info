#!/usr/bin/env npx tsx
/**
 * Dead-theme-classes audit — a `t-*` / `glass-*` / `ios-*` / `type-*` class used in
 * markup that NO stylesheet defines.
 *
 * Tailwind silently ignores an unknown class, so a typo or a renamed token
 * (`t-card-flat`, `type-led`) renders as plain unstyled text and nothing ever
 * fails. The theme classes are plain hand-written CSS in `core/app/assets/css/`
 * (no `@utility`), so "defined" means "appears as a `.class` selector there" —
 * or in a `<style>` block of the SFC that uses it.
 *
 * Variant-prefixed uses (`hover:t-bg-subtle`, `dark:t-text-muted`) are checked
 * on the BARE class, and the dedicated hover/group variants theme.css spells out
 * by hand (`.hover\:t-bg-subtle:hover`) are collected by unescaping selectors.
 *
 * A GATE AT 0 once the six known strays are cleaned up; until then a ratchet.
 * Tag a class that is applied at runtime and defined elsewhere `allow-dead-class: <why>`.
 *
 * Usage:
 *   pnpm audit:dead-theme-classes           # report
 *   pnpm audit:dead-theme-classes --list
 *   pnpm audit:dead-theme-classes --check
 */
import { finish, readRepoFile, trackedFiles, type Finding } from "./lib/audit-kit";
import { definedClasses, findDeadThemeClasses, styleBlocks } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **5**. `t-card-flat` ×3 and `t-hover-bg` ×2 (MemberDocumentsPage, documents/[id]) are used and defined nowhere — they render unstyled. Fix = define them or swap for `ios-card` / `hover:t-bg-subtle`; then this is a gate at 0.
 *
 * 2026-11-05 (Phase 9) — **0**: `t-card-flat` dropped (the `<Card>` styles itself), `t-hover-bg` → `hover:t-bg-subtle`. A gate at 0 from here.
 */
const BASELINE = 0;

const defined = new Set<string>();
for (const f of trackedFiles(["app/**/*.css", "core/app/**/*.css"])) {
  // theme.css hand-writes variants as `.hover\:t-bg-subtle:hover` — unescape so the BARE class is defined too.
  for (const c of definedClasses(readRepoFile(f).replace(/\\:/g, ":"))) defined.add(c);
}
if (defined.size < 40) {
  console.error(`✗ dead-theme-classes audit: only ${defined.size} classes parsed from the stylesheets — fix the parser.`);
  process.exit(1);
}

const findings: Finding[] = [];
let allowed = 0;
const files = trackedFiles(["app/**/*.vue", "app/**/*.ts", "core/app/**/*.vue", "core/app/**/*.ts"]);
for (const file of files) {
  const src = readRepoFile(file);
  const local = new Set(defined);
  if (file.endsWith(".vue")) for (const b of styleBlocks(src)) for (const c of definedClasses(b.body)) local.add(c);
  const r = findDeadThemeClasses(src, local, undefined, !file.endsWith(".vue"));
  allowed += r.allowed;
  for (const h of r.hits) findings.push({ file, line: h.line, text: `${h.key}  —  ${h.text}`, key: h.key });
}

finish({
  name: "dead-theme-classes",
  script: "audit-dead-theme-classes.ts",
  baseline: BASELINE,
  findings,
  note: `${defined.size} classes defined · ${files.length} files scanned${allowed ? ` · ${allowed} tagged allow-dead-class` : ""}`,
  fix: [
    "The class is not defined in core/app/assets/css/ — fix the name or define it.",
    "A class applied at runtime and defined elsewhere → tag it `allow-dead-class: <why>`.",
  ],
});
