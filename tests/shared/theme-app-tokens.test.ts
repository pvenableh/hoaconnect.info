import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The workspace theme (`html.theme-app`) has to define every `--theme-*` token
// the public themes define. Roughly 3,600 `t-*` utility usages read these, and
// theme.css puts the CLASSIC values on `:root` — so a token that exists in the
// public blocks but is missing from the workspace block does not fall back to
// something sensible, it falls back to cream-and-gold, on one property, in one
// place, and nobody notices for a month. This test is the tripwire.

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const THEME_CSS = read("core/app/assets/css/theme.css");
const THEME_APP_CSS = read("core/app/assets/css/theme-app.css");

/** Custom-property names declared anywhere in a chunk of CSS. */
function declaredVars(css: string, prefix: string): Set<string> {
  const names = new Set<string>();
  const re = new RegExp(`(--${prefix}[a-z0-9-]*)\\s*:`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) names.add(m[1]);
  return names;
}

/** The body of the first rule whose selector list contains `selector`. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", at);
  if (open === -1) throw new Error(`no block for: ${selector}`);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced block for: ${selector}`);
}

describe("theme-app token completeness", () => {
  const publicTokens = declaredVars(THEME_CSS, "theme-");
  const appBlock = ruleBody(THEME_APP_CSS, "html.theme-app {");
  const appTokens = declaredVars(appBlock, "theme-");

  it("reads a plausible token set from each file", () => {
    // Guards the parser itself: if these ever collapse to zero, every other
    // assertion below would pass vacuously.
    expect(publicTokens.size).toBeGreaterThan(40);
    expect(appTokens.size).toBeGreaterThan(40);
  });

  it("defines every --theme-* token the public themes define", () => {
    const missing = [...publicTokens].filter((t) => !appTokens.has(t)).sort();
    expect(missing).toEqual([]);
  });

  it("pins the glass accent in both modes so first paint is correct before JS", () => {
    const darkBlock = ruleBody(THEME_APP_CSS, "html.theme-app.dark {");
    for (const v of ["--app-accent-h", "--app-accent-s", "--app-accent-l"]) {
      expect(appBlock).toContain(v);
      expect(darkBlock).toContain(v);
    }
  });

  // ---- Contrast ----------------------------------------------------------
  // Every text rung is real content somewhere in the app, so every text rung has
  // to clear WCAG AA against the surfaces it can land on. The first draft of
  // this palette shipped a "muted" that measured 2.65:1 on white; it looked
  // right in a screenshot and was unreadable in practice.

  const srgb = (v: number) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

  function luminance(hex: string): number {
    const h = hex.trim().replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  }

  function contrast(a: string, b: string): number {
    const [l1, l2] = [luminance(a), luminance(b)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  /** Pull the light and dark halves of a `light-dark(a, b)` token. */
  function pair(token: string): { light: string; dark: string } {
    const m = appBlock.match(
      new RegExp(`${token}\\s*:\\s*light-dark\\(\\s*(#[0-9a-f]{6})\\s*,\\s*(#[0-9a-f]{6})\\s*\\)`, "i"),
    );
    if (!m) throw new Error(`no light-dark() hex pair for ${token}`);
    return { light: m[1], dark: m[2] };
  }

  it("clears WCAG AA for every text rung, on the page and on a card", () => {
    const page = pair("--theme-bg-primary");
    const card = pair("--theme-card-bg");
    const rungs = [
      "--theme-text-primary",
      "--theme-text-secondary",
      "--theme-text-tertiary",
      "--theme-text-muted",
    ];

    const failures: string[] = [];
    for (const rung of rungs) {
      const text = pair(rung);
      for (const [mode, ground] of [
        ["light/page", page.light],
        ["light/card", card.light],
        ["dark/page", page.dark],
        ["dark/card", card.dark],
      ] as const) {
        const fg = mode.startsWith("light") ? text.light : text.dark;
        const r = contrast(fg, ground);
        if (r < 4.5) failures.push(`${rung} on ${mode}: ${r.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps the text ramp monotonic so the hierarchy still reads", () => {
    const page = pair("--theme-bg-primary");
    const rungs = [
      "--theme-text-primary",
      "--theme-text-secondary",
      "--theme-text-tertiary",
      "--theme-text-muted",
    ].map(pair);

    for (const mode of ["light", "dark"] as const) {
      const ratios = rungs.map((r) => contrast(r[mode], page[mode]));
      const descending = [...ratios].sort((a, b) => b - a);
      expect(ratios.map((n) => +n.toFixed(2))).toEqual(
        descending.map((n) => +n.toFixed(2)),
      );
    }
  });

  it("keeps accent fills legible against the text placed on them", () => {
    // `--primary` is an accent FILL with `--theme-button-text` on top, and it is
    // also `t-text-accent` on the page. Both readings have to work, which is why
    // the ink accent is a deeper cyan than the decorative glass accent.
    const accent = pair("--theme-accent-primary");
    const onAccent = pair("--theme-button-text");
    const page = pair("--theme-bg-primary");

    for (const mode of ["light", "dark"] as const) {
      expect(contrast(accent[mode], onAccent[mode])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent[mode], page[mode])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps a non-light-dark() fallback for every colour token", () => {
    // Without this, a browser that cannot resolve light-dark() renders dark mode
    // with light-mode colours — unreadable, not merely unstyled.
    const at = THEME_APP_CSS.indexOf("@supports not (color: light-dark");
    expect(at).toBeGreaterThan(-1);
    const fallback = THEME_APP_CSS.slice(at);
    const fallbackTokens = declaredVars(fallback, "theme-");

    const colourTokens = [...appTokens].filter((t) => {
      const decl = appBlock.match(new RegExp(`${t}\\s*:([^;]*);`));
      return decl ? decl[1].includes("light-dark(") : false;
    });
    const missing = colourTokens.filter((t) => !fallbackTokens.has(t)).sort();
    expect(missing).toEqual([]);
  });
});
