/**
 * ESLint on the STAGED files only — errors block the commit, warnings do not
 * (the warning burn-down is `pnpm lint`'s `--max-warnings` ratchet, not a
 * per-commit tax on whoever touches a file).
 *
 * Deliberately NOT prettier. `.prettierrc` exists now (2026-11-12), fitted to
 * the code as written (140 columns, double quotes, semicolons, es5 commas), but
 * the code was never run through Prettier: on a sample of 174 files only 47
 * came out unchanged, and the rest averaged ~22 changed lines. `prettier
 * --write` on every touched file would still bury a 5-line change in that
 * churn. Format a file deliberately, in its own commit, when that is the point.
 *
 * `app/components/ui/**` is vendored shadcn-vue and is in eslint.config.js's
 * ignores; lint-staged would still hand those paths to eslint, so they are
 * filtered here too (a file that is entirely ignored makes ESLint warn, and
 * `--max-warnings 0` would turn that into a failure).
 */
const IGNORED = ["/app/components/ui/", "/core/types/", "/core/public/", "/public/", "/scripts/browser/"];

module.exports = {
  "*.{ts,mts,vue,js,mjs}": (files) => {
    const targets = files.filter((f) => !IGNORED.some((dir) => f.includes(dir)) && !f.endsWith(".d.ts"));
    if (targets.length === 0) return [];
    return [`eslint --no-warn-ignored ${targets.map((f) => JSON.stringify(f)).join(" ")}`];
  },
};
