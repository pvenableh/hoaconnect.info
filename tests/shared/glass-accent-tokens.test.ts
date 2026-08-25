import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The declaration-site trap, made into a tripwire.
//
// A custom property whose value contains `var()` is substituted at
// computed-value time ON THE DECLARING ELEMENT; descendants inherit the
// already-substituted string. So `:root { --glass-shadow-h: var(--app-accent-h) }`
// answers the question once, on `<html>`, and a page container that sets
// `--app-accent-h` later — `.accent-emerald` on payments, `.accent-violet` on
// projects, `applyDocumentAccent` per active app — cannot change the answer.
//
// earnest-ui.css therefore declares the accent-bearing half of the edge system
// on a LIST OF SURFACE SELECTORS instead. That list is only correct while it
// covers every rule that consumes those tokens, and nothing about adding a new
// `box-shadow: var(--glass-rim-shadow)` somewhere reminds anyone to extend it.
// This test is that reminder.

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const FILES = [
  "core/app/assets/css/earnest-ui.css",
  "core/app/assets/css/theme.css",
  "core/app/assets/css/theme-app.css",
  "core/app/assets/css/landing.css",
  "core/app/assets/css/main.css",
] as const;

/** Comment bodies, blanked so prose about a token never counts as a use. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

interface Rule {
  file: string;
  selector: string;
  body: string;
}

/**
 * Every LEAF rule — a `selector { … }` whose body declares properties rather
 * than holding more rules. Walks braces so `@layer`, `@media` and `@supports`
 * wrappers are transparent: their selector is discarded and the rules inside
 * are yielded on their own terms.
 */
function leafRules(css: string, file: string): Rule[] {
  const out: Rule[] = [];
  const src = stripComments(css);
  let depth = 0;
  let selStart = 0;
  const openAt: number[] = [];
  const selOf: string[] = [];

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") {
      selOf[depth] = src.slice(selStart, i).trim();
      openAt[depth] = i;
      depth += 1;
      selStart = i + 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth < 0) return out; // unbalanced — give up rather than lie
      const body = src.slice(openAt[depth] + 1, i);
      // A leaf holds no nested block of its own.
      if (!body.includes("{")) out.push({ file, selector: selOf[depth], body });
      selStart = i + 1;
    }
  }
  return out;
}

const RULES = FILES.flatMap((f) => leafRules(read(f), f));

describe("glass accent tokens", () => {
  it("parses a plausible number of rules out of the stylesheets", () => {
    // Guards the walker: if this collapses, every assertion below passes
    // vacuously.
    expect(RULES.length).toBeGreaterThan(200);
  });

  // ---- The redeclaration list -------------------------------------------
  // Read out of the CSS itself, so the test tracks the source rather than a
  // second copy of it that can drift.
  const EDGE = RULES.find(
    (r) => r.selector.includes(":root") && /--glass-edge-shadow\s*:/.test(r.body),
  );

  it("declares the edge tokens on a surface list that includes :root", () => {
    expect(EDGE).toBeDefined();
    // `:root` alone would be the trap itself.
    expect(EDGE!.selector.split(",").length).toBeGreaterThan(1);
  });

  /** The classes the redeclaration block covers, `:root` aside. */
  const covered = (EDGE?.selector ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("."))
    .map((s) => s.slice(1));

  it("covers every rule that consumes an accent-bearing edge token", () => {
    const CONSUMES =
      /var\(\s*--glass-(rim-shadow|edge-shadow|lift-shadow|shadow-h|shade)\b/;

    const uncovered = RULES.filter((r) => {
      if (r === EDGE) return false; // the block builds them; it does not inherit them
      if (!CONSUMES.test(r.body)) return false;
      // `:root` / `.dark` are the html element itself — they get the root accent
      // by definition and there is nothing above them to inherit wrongly from.
      if (/^(:root|\.dark|html)\b[^,]*$/.test(r.selector.trim())) return false;
      return !covered.some((c) => r.selector.includes(`.${c}`));
    }).map((r) => `${r.file}  ${r.selector.replace(/\s+/g, " ").slice(0, 90)}`);

    expect(uncovered).toEqual([]);
  });

  it("never resolves --app-accent-h inside a :root-only declaration", () => {
    // The trap in its original form. A `:root`-only rule that reads the accent
    // bakes `<html>`'s answer into a token every descendant then inherits.
    const offenders = RULES.filter(
      (r) => /^(:root|\.dark|html[.\w-]*)$/.test(r.selector.trim()) && /var\(\s*--app-accent-h/.test(r.body),
    ).map((r) => {
      const decl = r.body.match(/(--[a-z0-9-]+)\s*:[^;]*var\(\s*--app-accent-h[^;]*;/i);
      return `${r.file}  ${r.selector.trim()}  ${decl?.[0].replace(/\s+/g, " ").slice(0, 80) ?? ""}`;
    });

    expect(offenders).toEqual([]);
  });
});
