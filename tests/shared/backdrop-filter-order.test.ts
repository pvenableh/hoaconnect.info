import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * ⚠️ Write `-webkit-backdrop-filter` BEFORE `backdrop-filter`, or production has no glass.
 *
 * Tailwind v4 runs every stylesheet through lightningcss at build time, and
 * lightningcss treats a prefixed declaration that FOLLOWS the standard one as
 * overriding it: `backdrop-filter: X; -webkit-backdrop-filter: X;` minifies to
 * `-webkit-backdrop-filter: X` alone. Chromium and Firefox do not read the
 * prefixed property, so every glass surface shipped with no blur outside Safari
 * — measured in the Phase 1a build (entry CSS: 24 prefixed, 4 unprefixed, all 4
 * from Tailwind utilities). The prefixed-first order survives (with targets it
 * emits both). Dev mode does not minify, which is why it looked fine locally.
 *
 * Scope: the workspace. The public site (Org/Landing*, LandingBuilder/*,
 * landing.css, theme.css) still has the bad order and is a separate change —
 * see the Phase 1a Session log.
 */
const ROOT = process.cwd();
const SKIP = [/Org\/Landing/, /LandingBuilder\//, /assets\/css\/landing\.css$/, /assets\/css\/theme\.css$/];
const BAD = /(^|[^-])backdrop-filter:[^;]*;\s*-webkit-backdrop-filter/m;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(css|vue)$/.test(name)) yield p;
  }
}

describe("backdrop-filter declaration order", () => {
  it("no workspace stylesheet declares -webkit-backdrop-filter after backdrop-filter", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "core/app"]) {
      for (const file of walk(resolve(ROOT, dir))) {
        const rel = relative(ROOT, file);
        if (SKIP.some((re) => re.test(rel))) continue;
        if (BAD.test(readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
