#!/usr/bin/env npx tsx
/**
 * Easing audit — a hand-written `cubic-bezier()` outside the motion tokens.
 *
 * Plan `docs/plan-apple-platform-direction.md` session 3 (ported from Earnest's
 * `scripts/audit-easing.ts`): motion reads the house curves, written once.
 *
 *   CSS          var(--spring), var(--spring-out), var(--spring-bounce),
 *                var(--ease-out-expo), var(--ease-exit)   core/app/assets/css/variables.css
 *   JavaScript   EASING / transition()                     core/shared/motion/index.ts
 *
 * The two are twins (tests/shared/motion-tokens.test.ts). Under reduced motion
 * every curve flattens to linear, so a surface that reads a token degrades with
 * it; a literal curve does not.
 *
 * WHAT COUNTS: every `cubic-bezier(` in a tracked app/** or core/** .vue, .css
 * or .ts file, outside comments, including a `var(--spring, cubic-bezier(…))`
 * fallback and a Tailwind `ease-[cubic-bezier(…)]`. Exempt: the five token
 * lines in variables.css, the JS home core/shared/motion/index.ts, and the
 * vendored shadcn `ui/` kit. A curve with its own character (the landing
 * site's editorial ease, a chart's settle) stays counted: the baseline records
 * that it was looked at. Keyword easings (`ease`, `ease-out`) are not counted.
 *
 * Usage:
 *   pnpm audit:easing           # report
 *   pnpm audit:easing --list    # every finding
 *   pnpm audit:easing --top     # count per file
 */
import { blankComments, finish, isVendoredUi, readRepoFile, trackedFiles, type Finding } from "./lib/audit-kit";

/**
 * Lower it as curves move onto tokens; NEVER raise it to make a commit pass.
 *
 * 2026-11-27 (session 3) — 29 at HEAD (2cd67aac), across 11 files. 16 after it:
 *   the five unused legacy curves in variables.css (--bounce, --curve, --bounce2,
 *   --hoverEasing, --returnEasing) and the unused --theme-transition-slower (3)
 *   were deleted, the four charts' settle (0.22, 1, 0.36, 1) folded into
 *   --ease-out-expo, and theme.css's `var(--spring, cubic-bezier(…))` lost its
 *   fallback. Left: the landing site's editorial ease (landing.css, LandingNav,
 *   LandingDrawer), theme.css's --theme-transition-* scale, and Payment/Methods.
 */
const BASELINE = 16;

const TOKEN_FILE = "core/app/assets/css/variables.css";
const TOKEN_LINE = /^\s*--(spring|spring-out|spring-bounce|ease-out-expo|ease-exit)\s*:/;
const JS_HOME = "core/shared/motion/index.ts";

const files = trackedFiles(["app/**/*.vue", "app/**/*.css", "app/**/*.ts", "core/**/*.vue", "core/**/*.css", "core/**/*.ts"]).filter(
  (f) => f !== JS_HOME && !isVendoredUi(f),
);

const findings: Finding[] = [];
for (const file of files) {
  const raw = readRepoFile(file);
  if (!raw.includes("cubic-bezier")) continue;
  const kind = file.endsWith(".vue") ? "vue" : file.endsWith(".css") ? "css" : "ts";
  const rawLines = raw.split("\n");
  blankComments(raw, kind)
    .split("\n")
    .forEach((line, i) => {
      if (file === TOKEN_FILE && TOKEN_LINE.test(line)) return;
      for (const m of line.matchAll(/cubic-bezier\(([^)]*)\)/g)) {
        findings.push({ file, line: i + 1, text: rawLines[i]!.trim().slice(0, 140), key: m[1]!.replace(/\s+/g, "") });
      }
    });
}

finish({
  name: "easing",
  script: "audit-easing.ts",
  baseline: BASELINE,
  findings,
  note: `${new Set(findings.map((f) => f.file)).size} files · curves live in ${TOKEN_FILE} and ${JS_HOME}`,
  fix: [
    "Motion reads a house curve: var(--spring) / --spring-out / --spring-bounce / --ease-out-expo / --ease-exit in CSS,",
    `EASING or transition() from ${JS_HOME} in script. A new curve is a token in both files, not a literal.`,
  ],
});
