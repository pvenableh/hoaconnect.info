import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import nested from "postcss-nested";

/**
 * Every blur answers Reduce Transparency and Increase Contrast
 * (docs/plan-apple-platform-direction.md, session 2).
 *
 * For each rule that paints a `backdrop-filter` blur — in any stylesheet or Vue
 * `<style>` block outside the stock `ui/` kit — some
 * `@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)`
 * block must set `backdrop-filter: none` on the same selector. That block is
 * also what the Solid surfaces switch reaches (core/build/postcss-solid-surfaces.ts
 * copies it behind `data-a11y-solid`), so a blur with no such twin is glass the
 * switch cannot turn off — Earnest's Composer was exactly that (E§7).
 *
 * It checks that the twin exists, not that it wins the cascade; the Browser
 * pane check in §7 covers order for the materials.
 */
const BOTH = /prefers-reduced-transparency:\s*reduce[^{]*prefers-contrast:\s*more|prefers-contrast:\s*more[^{]*prefers-reduced-transparency:\s*reduce/;

function styleChunks(file: string, src: string): string[] {
  if (!file.endsWith(".vue")) return [src];
  return [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]!);
}

describe("solid surfaces coverage", () => {
  const files = execSync('git ls-files "*.css" "*.vue"')
    .toString()
    .trim()
    .split("\n")
    .filter((f) => !f.startsWith("app/components/ui/") && !f.startsWith("public/"));

  const blurs: { at: string; selector: string }[] = [];
  const answered = new Set<string>();
  const halfAnswered: string[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("backdrop-filter")) continue;
    for (const chunk of styleChunks(file, src)) {
      const root = postcss([nested]).process(chunk, { from: undefined }).root;
      root.walkDecls("backdrop-filter", (decl) => {
        const rule = decl.parent;
        if (!rule || rule.type !== "rule") return;
        let media = "";
        for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
          if (p.type === "atrule") media += ` ${(p as postcss.AtRule).params}`;
        }
        const selectors = (rule as postcss.Rule).selectors.map((s) => s.trim());
        if (/none/.test(decl.value)) {
          if (BOTH.test(media)) selectors.forEach((s) => answered.add(s));
          else if (/prefers-reduced-transparency/.test(media)) halfAnswered.push(`${file}: ${media.trim()}`);
          return;
        }
        if (!/blur\(/.test(decl.value)) return;
        for (const selector of selectors) blurs.push({ at: `${file}:${decl.source?.start?.line}`, selector });
      });
    }
  }

  it("finds the blur rules it is guarding", () => {
    expect(blurs.length).toBeGreaterThan(20);
  });

  it("answers every blur with a backdrop-filter: none under both settings", () => {
    const missing = blurs.filter((b) => !answered.has(b.selector)).map((b) => `${b.at}  ${b.selector}`);
    expect(missing).toEqual([]);
  });

  it("never answers Reduce Transparency without Increase Contrast", () => {
    expect(halfAnswered).toEqual([]);
  });
});
