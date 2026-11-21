#!/usr/bin/env npx tsx
/**
 * Materials audit — `backdrop-filter` may appear only in `core/app/assets/css/earnest-ui.css`.
 *
 * Plan `docs/plan-unified-experience.md` §3 (Material v2): every blur lives in the
 * four named materials (`--mat-*`, `.material-*`) defined in earnest-ui.css, so a
 * new surface takes a material instead of hand-writing its own blur. A component
 * that sets its own `backdrop-filter` (inline, in a `<style>` block, or in another
 * stylesheet) is a second recipe and fails this gate.
 *
 * Usage:
 *   pnpm audit:materials           # report
 *   pnpm audit:materials --list
 *   pnpm audit:materials --check
 */
import { finish, readRepoFile, trackedFiles, type Finding } from "./lib/audit-kit";

const ALLOWED_FILE = "core/app/assets/css/earnest-ui.css";

/**
 * The marketing system (landing.css) owns its own blur tokens (`--landing-blur-*`).
 * Landing and marketing files may blur only through those tokens or the
 * `.landing-blur-*` classes, never a literal radius, so the public site retunes
 * from one file.
 */
const LANDING_FILE = "core/app/assets/css/landing.css";
const LANDING_SCOPE = [
  /^app\/components\/Org\/Landing\//,
  /^app\/components\/Marketing\/Landing\.vue$/,
  /^app\/pages\/(experimental|property-managers|your-data)\.vue$/,
];
const isLandingScope = (file: string) => LANDING_SCOPE.some((re) => re.test(file));

/** Gate at 0: no baseline. */
const BASELINE = 0;

const findings: Finding[] = [];
const files = trackedFiles(["app/**/*.vue", "app/**/*.ts", "app/**/*.css", "core/**/*.vue", "core/**/*.ts", "core/**/*.css"]);
for (const file of files) {
  if (file === ALLOWED_FILE || file === LANDING_FILE) continue;
  const lines = readRepoFile(file).split("\n");
  lines.forEach((text, i) => {
    if (isLandingScope(file)) {
      // Landing scope: blur only through the tokens or the landing classes.
      const literal = /blur\((?!var\(--landing-blur)/.test(text) || /backdrop-blur-/.test(text);
      if (literal && /backdrop-filter|backdrop-blur|blur\(/.test(text)) {
        findings.push({ file, line: i + 1, text: text.trim().slice(0, 140), key: "landing-literal-blur" });
      }
      return;
    }
    // Only a line that ADDS a blur counts. `backdrop-filter: none` (reduced
    // transparency) and `@supports` feature queries do not blur anything.
    // Scope is the backdrop only: a plain `filter: blur()` (decorative, not behind glass) is not a material.
    if (/backdrop-(filter\s*:[^;]*blur\(|blur-)/.test(text) && !/@supports/.test(text)) {
      findings.push({ file, line: i + 1, text: text.trim().slice(0, 140), key: "backdrop-outside-materials" });
    }
  });
}

finish({
  name: "materials",
  script: "audit-materials.ts",
  baseline: BASELINE,
  findings,
  note: `${files.length} files scanned · blur only in ${ALLOWED_FILE} and ${LANDING_FILE} (landing scope uses its tokens)`,
  fix: [
    `App blur: move it into a material in ${ALLOWED_FILE} (--mat-* / .material-*) and apply the class.`,
    `Landing blur: use var(--landing-blur-*) or .landing-blur-sm/-md, defined in ${LANDING_FILE}.`,
    "Tailwind backdrop-blur-* utilities count too; use the material or landing class instead.",
  ],
});
