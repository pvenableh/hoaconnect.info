/**
 * ESLint on the STAGED files only — errors block the commit, warnings do not
 * (the warning burn-down is `pnpm lint`'s `--max-warnings` ratchet, not a
 * per-commit tax on whoever touches a file).
 *
 * Deliberately NOT prettier: this repo has no committed prettier config, so
 * `prettier --write` on a touched file would reformat all of it to defaults and
 * bury a 5-line change in a 500-line diff. Earnest runs it because it has the
 * config; add `.prettierrc` first, then add it back here.
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
